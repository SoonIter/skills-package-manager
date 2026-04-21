import { access } from 'node:fs/promises'
import path from 'node:path'
import { isLockInSync } from '../config/compareSkillsLock'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import {
  getBundledSelfSkillSpecifier,
  SELF_SKILL_NAME,
  shouldInjectBundledSelfSkill,
} from '../config/skillsManifest'
import { resolveLockEntry, syncSkillsLock } from '../config/syncSkillsLock'
import type { InstallProgressListener, SkillsLock, SkillsManifest } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { fetchSkill } from '../fetchers'
import { applySkillPatch } from '../patches/skillPatch'
import { createFileSystemCache } from '../pipeline/cache'
import { sha256 } from '../utils/hash'
import { readInstallState, writeInstallState } from './installState'
import { linkSkill } from './links'
import { pruneManagedSkills } from './pruneManagedSkills'

async function areManagedSkillsInstalled(
  rootDir: string,
  installDir: string,
  skillNames: string[],
): Promise<boolean> {
  for (const skillName of skillNames) {
    try {
      await access(path.join(rootDir, installDir, skillName, 'SKILL.md'))
    } catch {
      return false
    }
  }
  return true
}

export async function withBundledSelfSkillLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
): Promise<SkillsLock> {
  if (!shouldInjectBundledSelfSkill(manifest) || lockfile.skills[SELF_SKILL_NAME]) {
    return lockfile
  }

  const { entry } = await resolveLockEntry(rootDir, getBundledSelfSkillSpecifier(), SELF_SKILL_NAME)

  return {
    ...lockfile,
    skills: {
      ...lockfile.skills,
      [SELF_SKILL_NAME]: entry,
    },
  }
}

export async function fetchSkillsFromLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
  options?: {
    onProgress?: InstallProgressListener
  },
) {
  const installDir = manifest.installDir ?? '.agents/skills'
  const linkTargets = manifest.linkTargets ?? []

  await pruneManagedSkills(rootDir, installDir, linkTargets, Object.keys(lockfile.skills))

  const lockDigest = sha256(JSON.stringify(lockfile))
  const state = await readInstallState(rootDir, installDir)
  if (
    state?.lockDigest === lockDigest &&
    (await areManagedSkillsInstalled(rootDir, installDir, Object.keys(lockfile.skills)))
  ) {
    return { status: 'skipped', reason: 'up-to-date' } as const
  }

  const cache = createFileSystemCache(rootDir)

  try {
    for (const [skillName, entry] of Object.entries(lockfile.skills)) {
      const { installPath } = await fetchSkill(rootDir, skillName, entry, installDir, cache)
      if (entry.patch) {
        await applySkillPatch(installPath, path.resolve(rootDir, entry.patch.path))
      }
      options?.onProgress?.({ type: 'added', skillName })
    }

    await writeInstallState(rootDir, installDir, {
      lockDigest,
      installDir,
      linkTargets,
      installerVersion: '0.1.0',
      installedAt: new Date().toISOString(),
    })
  } catch (error) {
    throw error
  }

  return { status: 'fetched', fetched: Object.keys(lockfile.skills) } as const
}

export async function linkSkillsFromLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
  options?: {
    onProgress?: InstallProgressListener
  },
) {
  const installDir = manifest.installDir ?? '.agents/skills'
  const linkTargets = manifest.linkTargets ?? []

  for (const skillName of Object.keys(lockfile.skills)) {
    for (const linkTarget of linkTargets) {
      await linkSkill(rootDir, installDir, linkTarget, skillName)
    }
    options?.onProgress?.({ type: 'installed', skillName })
  }

  return { status: 'linked', linked: Object.keys(lockfile.skills) } as const
}

export async function installSkills(
  rootDir: string,
  options?: { frozenLockfile?: boolean; onProgress?: InstallProgressListener },
) {
  const manifest = await readSkillsManifest(rootDir)
  if (!manifest) {
    return { status: 'skipped', reason: 'manifest-missing' } as const
  }

  const currentLock = await readSkillsLock(rootDir)

  let lockfile: SkillsLock

  if (options?.frozenLockfile) {
    if (!currentLock) {
      throw new Error('Lockfile is required in frozen mode but none was found')
    }
    if (!(await isLockInSync(rootDir, manifest, currentLock))) {
      throw new Error(
        'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
      )
    }
    lockfile = currentLock
    for (const skillName of Object.keys(lockfile.skills)) {
      options?.onProgress?.({ type: 'resolved', skillName })
    }
  } else {
    lockfile = await syncSkillsLock(rootDir, manifest, currentLock, {
      onProgress: options?.onProgress,
    })
  }

  const runtimeLock = await withBundledSelfSkillLock(rootDir, manifest, lockfile)

  await fetchSkillsFromLock(rootDir, manifest, runtimeLock, {
    onProgress: options?.onProgress,
  })
  await linkSkillsFromLock(rootDir, manifest, runtimeLock, {
    onProgress: options?.onProgress,
  })

  if (!options?.frozenLockfile) {
    await writeSkillsLock(rootDir, lockfile)
  }

  return { status: 'installed', installed: Object.keys(runtimeLock.skills) } as const
}

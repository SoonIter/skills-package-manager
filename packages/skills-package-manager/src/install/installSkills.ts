import path from 'node:path'
import { isLockInSync } from '../config/compareSkillsLock'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { SkillsLock, SkillsManifest } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { sha256 } from '../utils/hash'
import { readInstallState, writeInstallState } from './installState'
import { linkSkill } from './links'
import { materializeGitSkill } from './materializeGitSkill'
import { materializeLocalSkill } from './materializeLocalSkill'
import { pruneManagedSkills } from './pruneManagedSkills'

export const installStageHooks = {
  beforeFetch: async (_rootDir: string, _manifest: SkillsManifest, _lockfile: SkillsLock) => {},
}

function extractSkillPath(specifier: string, skillName: string): string {
  const marker = '#path:'
  const index = specifier.indexOf(marker)
  if (index >= 0) {
    return specifier.slice(index + marker.length)
  }
  return `/${skillName}`
}

export async function fetchSkillsFromLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
) {
  await installStageHooks.beforeFetch(rootDir, manifest, lockfile)

  const lockDigest = sha256(JSON.stringify(lockfile))
  const state = await readInstallState(rootDir)
  if (state?.lockDigest === lockDigest) {
    return { status: 'skipped', reason: 'up-to-date' } as const
  }

  const installDir = manifest.installDir ?? '.agents/skills'
  const linkTargets = manifest.linkTargets ?? []

  await pruneManagedSkills(rootDir, installDir, linkTargets, Object.keys(lockfile.skills))

  for (const [skillName, entry] of Object.entries(lockfile.skills)) {
    if (entry.resolution.type === 'file') {
      await materializeLocalSkill(
        rootDir,
        skillName,
        path.resolve(rootDir, entry.resolution.path),
        extractSkillPath(entry.specifier, skillName),
        installDir,
      )
      continue
    }

    if (entry.resolution.type === 'git') {
      await materializeGitSkill(
        rootDir,
        skillName,
        entry.resolution.url,
        entry.resolution.commit,
        entry.resolution.path,
        installDir,
      )
      continue
    }

    throw new Error(`Unsupported resolution type in 0.1.0 core flow: ${entry.resolution.type}`)
  }

  await writeInstallState(rootDir, {
    lockDigest,
    installDir,
    linkTargets,
    installerVersion: '0.1.0',
    installedAt: new Date().toISOString(),
  })

  return { status: 'fetched', fetched: Object.keys(lockfile.skills) } as const
}

export async function linkSkillsFromLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
) {
  const installDir = manifest.installDir ?? '.agents/skills'
  const linkTargets = manifest.linkTargets ?? []

  for (const skillName of Object.keys(lockfile.skills)) {
    for (const linkTarget of linkTargets) {
      await linkSkill(rootDir, installDir, linkTarget, skillName)
    }
  }

  return { status: 'linked', linked: Object.keys(lockfile.skills) } as const
}

export async function installSkills(rootDir: string, options?: { frozenLockfile?: boolean }) {
  const manifest = await readSkillsManifest(rootDir)
  if (!manifest) {
    return { status: 'skipped', reason: 'manifest-missing' } as const
  }

  const currentLock = await readSkillsLock(rootDir)

  let lockfile: SkillsLock

  if (options?.frozenLockfile) {
    // Frozen mode: lock must exist and be in sync
    if (!currentLock) {
      throw new Error('Lockfile is required in frozen mode but none was found')
    }
    if (!isLockInSync(manifest, currentLock)) {
      throw new Error(
        'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
      )
    }
    lockfile = currentLock
  } else {
    // Normal mode: sync lock with manifest (may trigger network requests)
    lockfile = await syncSkillsLock(rootDir, manifest, currentLock)
  }

  await fetchSkillsFromLock(rootDir, manifest, lockfile)
  await linkSkillsFromLock(rootDir, manifest, lockfile)

  // Write lockfile only after all operations succeed (atomicity)
  if (!options?.frozenLockfile) {
    await writeSkillsLock(rootDir, lockfile)
  }

  return { status: 'installed', installed: Object.keys(lockfile.skills) } as const
}

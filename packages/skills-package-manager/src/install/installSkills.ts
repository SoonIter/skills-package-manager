import path from 'node:path'
import { isLockInSync } from '../config/compareSkillsLock'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { InstallProgressListener, SkillsLock, SkillsManifest } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { cleanupPackedNpmPackage, packNpmPackage } from '../npm/packPackage'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { sha256 } from '../utils/hash'
import { readInstallState, writeInstallState } from './installState'
import { linkSkill } from './links'
import { materializeGitSkill } from './materializeGitSkill'
import { materializeLocalSkill } from './materializeLocalSkill'
import { materializePackedSkill } from './materializePackedSkill'
import { pruneManagedSkills } from './pruneManagedSkills'

export const installStageHooks = {
  beforeFetch: async (_rootDir: string, _manifest: SkillsManifest, _lockfile: SkillsLock) => {},
}

function resolveNpmPackSource(specifier: string, packageName: string, version: string): string {
  const normalized = normalizeSpecifier(specifier)
  const source = normalized.source.slice('npm:'.length)

  if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
    return source
  }

  if (source.includes(':')) {
    return source
  }

  return `${packageName}@${version}`
}

export async function fetchSkillsFromLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
  options?: {
    onProgress?: InstallProgressListener
  },
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
    if (entry.resolution.type === 'link') {
      await materializeLocalSkill(
        rootDir,
        skillName,
        path.resolve(rootDir, entry.resolution.path),
        '/',
        installDir,
      )
      continue
    }

    if (entry.resolution.type === 'file') {
      await materializePackedSkill(
        rootDir,
        skillName,
        path.resolve(rootDir, entry.resolution.tarball),
        entry.resolution.path,
        installDir,
      )
      options?.onProgress?.({ type: 'added', skillName })
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
      options?.onProgress?.({ type: 'added', skillName })
      continue
    }

    if (entry.resolution.type === 'npm') {
      const packed = await packNpmPackage(
        resolveNpmPackSource(
          entry.specifier,
          entry.resolution.packageName,
          entry.resolution.version,
        ),
      )

      try {
        await materializePackedSkill(
          rootDir,
          skillName,
          packed.tarballPath,
          entry.resolution.path,
          installDir,
        )
      } finally {
        await cleanupPackedNpmPackage(packed.tarballPath)
      }
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
    for (const skillName of Object.keys(lockfile.skills)) {
      options?.onProgress?.({ type: 'resolved', skillName })
    }
  } else {
    // Normal mode: sync lock with manifest (may trigger network requests)
    lockfile = await syncSkillsLock(rootDir, manifest, currentLock, {
      onProgress: options?.onProgress,
    })
  }

  await fetchSkillsFromLock(rootDir, manifest, lockfile, { onProgress: options?.onProgress })
  await linkSkillsFromLock(rootDir, manifest, lockfile, { onProgress: options?.onProgress })

  // Write lockfile only after all operations succeed (atomicity)
  if (!options?.frozenLockfile) {
    await writeSkillsLock(rootDir, lockfile)
  }

  return { status: 'installed', installed: Object.keys(lockfile.skills) } as const
}

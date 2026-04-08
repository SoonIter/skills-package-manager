import { access } from 'node:fs/promises'
import path from 'node:path'
import { isLockInSync } from '../config/compareSkillsLock'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { InstallProgressListener, SkillsLock, SkillsManifest } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { cleanupPackedNpmPackage, downloadNpmPackageTarball } from '../npm/packPackage'
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

export async function fetchSkillsFromLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
  options?: {
    onProgress?: InstallProgressListener
  },
) {
  await installStageHooks.beforeFetch(rootDir, manifest, lockfile)

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

  const downloadedTarballs = new Map<string, Promise<string>>()

  try {
    for (const [skillName, entry] of Object.entries(lockfile.skills)) {
      if (entry.resolution.type === 'link') {
        await materializeLocalSkill(
          rootDir,
          skillName,
          path.resolve(rootDir, entry.resolution.path),
          '/',
          installDir,
        )
        options?.onProgress?.({ type: 'added', skillName })
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
        const cacheKey = `${entry.resolution.tarball}\0${entry.resolution.integrity ?? ''}`
        let tarballPathPromise = downloadedTarballs.get(cacheKey)
        if (!tarballPathPromise) {
          tarballPathPromise = downloadNpmPackageTarball(
            rootDir,
            entry.resolution.tarball,
            entry.resolution.integrity,
          )
          downloadedTarballs.set(cacheKey, tarballPathPromise)
        }

        const tarballPath = await tarballPathPromise
        await materializePackedSkill(
          rootDir,
          skillName,
          tarballPath,
          entry.resolution.path,
          installDir,
        )
        options?.onProgress?.({ type: 'added', skillName })
        continue
      }

      throw new Error(`Unsupported resolution type in 0.1.0 core flow: ${entry.resolution.type}`)
    }

    await writeInstallState(rootDir, installDir, {
      lockDigest,
      installDir,
      linkTargets,
      installerVersion: '0.1.0',
      installedAt: new Date().toISOString(),
    })
  } finally {
    const settledTarballs = await Promise.allSettled(downloadedTarballs.values())
    const downloadedPaths = new Set(
      settledTarballs
        .filter(
          (result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled',
        )
        .map((result) => result.value),
    )

    await Promise.all([...downloadedPaths].map((tarballPath) => cleanupPackedNpmPackage(tarballPath)))
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
    lockfile = await syncSkillsLock(rootDir, manifest, currentLock, {
      onProgress: options?.onProgress,
    })
  }

  await fetchSkillsFromLock(rootDir, manifest, lockfile, { onProgress: options?.onProgress })
  await linkSkillsFromLock(rootDir, manifest, lockfile, { onProgress: options?.onProgress })

  if (!options?.frozenLockfile) {
    await writeSkillsLock(rootDir, lockfile)
  }

  return { status: 'installed', installed: Object.keys(lockfile.skills) } as const
}

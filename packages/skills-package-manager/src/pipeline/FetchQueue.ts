import { access } from 'node:fs/promises'
import path from 'node:path'
import type { InstallProgressListener } from '../config/types'
import type { InstallState } from '../install/installState'
import { readInstallState, writeInstallState } from '../install/installState'
import { materializeGitSkill } from '../install/materializeGitSkill'
import { materializeLocalSkill } from '../install/materializeLocalSkill'
import { materializePackedSkill } from '../install/materializePackedSkill'
import { pruneManagedSkills } from '../install/pruneManagedSkills'
import type { NpmConfig } from '../npm/config'
import { cleanupPackedNpmPackage, downloadNpmPackageTarball } from '../npm/packPackage'
import { applySkillPatch } from '../patches/skillPatch'
import type { Lockfile } from '../structures/Lockfile'
import type { Manifest } from '../structures/Manifest'
import { sha256 } from '../utils/hash'

export type FetchedSkill = {
  skillName: string
  installDir: string
}

type FetchHooks = {
  beforeFetch?: (rootDir: string, manifest: Manifest, lockfile: Lockfile) => Promise<void>
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

export class FetchQueue {
  constructor(private readonly hooks: FetchHooks = {}) {}

  async run(options: {
    rootDir: string
    manifest: Manifest
    lockfile: Lockfile
    currentInstallState?: InstallState | null
    npmConfig?: NpmConfig
    onProgress?: InstallProgressListener
  }): Promise<{ status: 'skipped' | 'fetched'; fetched: FetchedSkill[] }> {
    await this.hooks.beforeFetch?.(options.rootDir, options.manifest, options.lockfile)

    const normalizedManifest = options.manifest.normalize()
    const installDir = normalizedManifest.installDir
    const linkTargets = normalizedManifest.linkTargets

    await pruneManagedSkills(
      options.rootDir,
      installDir,
      linkTargets,
      options.lockfile.skillNames(),
    )

    const lockDigest = sha256(JSON.stringify(options.lockfile.toJSON()))
    const state =
      options.currentInstallState ?? (await readInstallState(options.rootDir, installDir))
    if (
      state?.lockDigest === lockDigest &&
      (await areManagedSkillsInstalled(options.rootDir, installDir, options.lockfile.skillNames()))
    ) {
      return {
        status: 'skipped',
        fetched: options.lockfile.skillNames().map((skillName) => ({ skillName, installDir })),
      }
    }

    const downloadedTarballs = new Map<string, Promise<string>>()
    const fetched: FetchedSkill[] = []

    try {
      for (const [skillName, entry] of options.lockfile.entries()) {
        const resolution = entry.resolution.toJSON()

        if (resolution.type === 'link') {
          await materializeLocalSkill(
            options.rootDir,
            skillName,
            path.resolve(options.rootDir, resolution.path),
            '/',
            installDir,
          )
        } else if (resolution.type === 'file') {
          await materializePackedSkill(
            options.rootDir,
            skillName,
            path.resolve(options.rootDir, resolution.tarball),
            resolution.path,
            installDir,
          )
        } else if (resolution.type === 'git') {
          await materializeGitSkill(
            options.rootDir,
            skillName,
            resolution.url,
            resolution.commit,
            resolution.path,
            installDir,
          )
        } else if (resolution.type === 'npm') {
          const cacheKey = `${resolution.tarball}\0${resolution.integrity ?? ''}`
          let tarballPathPromise = downloadedTarballs.get(cacheKey)
          if (!tarballPathPromise) {
            tarballPathPromise = downloadNpmPackageTarball(
              options.rootDir,
              resolution.tarball,
              resolution.integrity,
              options.npmConfig,
            )
            downloadedTarballs.set(cacheKey, tarballPathPromise)
          }

          const tarballPath = await tarballPathPromise
          await materializePackedSkill(
            options.rootDir,
            skillName,
            tarballPath,
            resolution.path,
            installDir,
          )
        } else {
          throw new Error('Unsupported resolution type in 0.1.0 core flow')
        }

        if (entry.patch) {
          await applySkillPatch(
            path.join(options.rootDir, installDir, skillName),
            path.resolve(options.rootDir, entry.patch.path),
          )
        }

        options.onProgress?.({ type: 'added', skillName })
        fetched.push({ skillName, installDir })
      }

      await writeInstallState(options.rootDir, installDir, {
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
      await Promise.all(
        [...downloadedPaths].map((tarballPath) => cleanupPackedNpmPackage(tarballPath)),
      )
    }

    return { status: 'fetched', fetched }
  }
}

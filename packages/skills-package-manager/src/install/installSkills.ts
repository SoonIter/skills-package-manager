import type { InstallProgressListener, SkillsLock, SkillsManifest } from '../config/types'
import { FetchQueue } from '../pipeline/FetchQueue'
import { Installer } from '../pipeline/Installer'
import { LinkQueue } from '../pipeline/LinkQueue'
import { ResolveQueue } from '../pipeline/ResolveQueue'
import { ConfigRepository } from '../repositories/ConfigRepository'
import { Lockfile } from '../structures/Lockfile'
import { Manifest } from '../structures/Manifest'

export const installStageHooks = {
  beforeFetch: async (_rootDir: string, _manifest: SkillsManifest, _lockfile: SkillsLock) => {},
}

const resolveQueue = new ResolveQueue()

export async function withBundledSelfSkillLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
): Promise<SkillsLock> {
  return (
    await resolveQueue.createRuntimeLockfile({
      rootDir,
      manifest: Manifest.from(manifest),
      lockfile: Lockfile.from(lockfile),
    })
  ).toJSON()
}

export async function fetchSkillsFromLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
  options?: {
    onProgress?: InstallProgressListener
  },
) {
  return new FetchQueue({
    beforeFetch: async (cwd, nextManifest, nextLockfile) =>
      installStageHooks.beforeFetch(
        cwd,
        nextManifest.toJSON({ includeDefaults: true }),
        nextLockfile.toJSON(),
      ),
  }).run({
    rootDir,
    manifest: Manifest.from(manifest),
    lockfile: Lockfile.from(lockfile),
    onProgress: options?.onProgress,
  })
}

export async function linkSkillsFromLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
  options?: {
    onProgress?: InstallProgressListener
  },
) {
  const fetched = Lockfile.from(lockfile)
    .skillNames()
    .map((skillName) => ({
      skillName,
      installDir: Lockfile.from(lockfile).installDir,
    }))

  return {
    status: 'linked',
    linked: (
      await new LinkQueue().run({
        rootDir,
        manifest: Manifest.from(manifest),
        fetched,
        onProgress: options?.onProgress,
      })
    ).map(({ skillName }) => skillName),
  } as const
}

export async function installSkills(
  rootDir: string,
  options?: { frozenLockfile?: boolean; onProgress?: InstallProgressListener },
) {
  const config = await new ConfigRepository().load(rootDir)
  if (!config.manifest) {
    return { status: 'skipped', reason: 'manifest-missing' } as const
  }

  const installer = new Installer({
    hooks: {
      beforeFetch: async (cwd, manifest, lockfile) =>
        installStageHooks.beforeFetch(
          cwd,
          manifest.toJSON({ includeDefaults: true }),
          lockfile.toJSON(),
        ),
    },
  })

  const result = await installer.installConfig(config, {
    frozenLockfile: options?.frozenLockfile,
    onProgress: options?.onProgress,
  })

  if (result.status !== 'installed') {
    return result
  }

  return {
    status: 'installed',
    installed: result.installed,
  } as const
}

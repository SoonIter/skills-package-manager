import type { InstallProgressListener, SkillsLock, SkillsManifest } from '../config/types'
import { ErrorCode, ManifestError } from '../errors'
import { FetchQueue } from '../pipeline/FetchQueue'
import { LinkTaskQueue } from '../pipeline/LinkTaskQueue'
import { loadConfig } from '../pipeline/loadConfig'
import { ResolveQueue } from '../pipeline/ResolveQueue'
import { runResolvedPipeline } from '../pipeline/runPipeline'
import { LockfileRepository } from '../repositories/LockfileRepository'
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
    beforeFetch: async (cwd, manifest, lockfile) =>
      installStageHooks.beforeFetch(
        cwd,
        manifest.toJSON({ includeDefaults: true }),
        lockfile.toJSON(),
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
  const parsedLockfile = Lockfile.from(lockfile)
  const fetched = parsedLockfile.skillNames().map((skillName) => ({
    skillName,
    installDir: parsedLockfile.installDir,
  }))

  return {
    status: 'linked',
    linked: (
      await new LinkTaskQueue().run({
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
  const config = await loadConfig(rootDir)
  if (!config.manifest) {
    return { status: 'skipped', reason: 'manifest-missing' } as const
  }

  let lockfile: Lockfile
  if (options?.frozenLockfile) {
    if (!config.lockfile) {
      throw new ManifestError({
        code: ErrorCode.LOCKFILE_NOT_FOUND,
        filePath: `${rootDir}/skills-lock.yaml`,
        message: 'Lockfile is required in frozen mode but none was found. Run "spm install" first.',
      })
    }
    if (!(await config.lockfile.isInSyncWith(config.manifest, config.rootDir))) {
      throw new ManifestError({
        code: ErrorCode.LOCKFILE_OUTDATED,
        filePath: `${rootDir}/skills-lock.yaml`,
        message:
          'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
      })
    }
    lockfile = config.lockfile
    for (const skillName of lockfile.skillNames()) {
      options?.onProgress?.({ type: 'resolved', skillName })
    }
  } else {
    lockfile = await resolveQueue.syncLockfile({
      rootDir: config.rootDir,
      manifest: config.manifest,
      currentLock: config.lockfile,
      onProgress: options?.onProgress,
      npmConfig: config.npmConfig,
    })
  }

  const runtimeLock = await resolveQueue.createRuntimeLockfile({
    rootDir: config.rootDir,
    manifest: config.manifest,
    lockfile,
    npmConfig: config.npmConfig,
  })

  await runResolvedPipeline({
    rootDir: config.rootDir,
    manifest: config.manifest,
    lockfile: runtimeLock,
    currentInstallState: config.installState,
    onProgress: options?.onProgress,
    hooks: {
      beforeFetch: installStageHooks.beforeFetch,
    },
  })

  if (!options?.frozenLockfile) {
    await new LockfileRepository().write(config.rootDir, lockfile)
  }

  return {
    status: 'installed',
    installed: runtimeLock.skillNames(),
  } as const
}

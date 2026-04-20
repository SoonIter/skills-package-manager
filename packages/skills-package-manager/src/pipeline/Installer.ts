import type { InstallProgressListener } from '../config/types'
import { ErrorCode, ManifestError } from '../errors'
import { LockfileRepository } from '../repositories/LockfileRepository'
import type { Config } from '../structures/Config'
import type { Lockfile } from '../structures/Lockfile'
import type { Manifest } from '../structures/Manifest'
import { FetchQueue } from './FetchQueue'
import { LinkQueue } from './LinkQueue'
import { ResolveQueue } from './ResolveQueue'

export type InstallerHooks = {
  beforeFetch?: (rootDir: string, manifest: Manifest, lockfile: Lockfile) => Promise<void>
}

export class Installer {
  readonly resolveQueue: ResolveQueue
  readonly fetchQueue: FetchQueue
  readonly linkQueue: LinkQueue

  constructor(
    private readonly options: {
      hooks?: InstallerHooks
      resolveQueue?: ResolveQueue
      fetchQueue?: FetchQueue
      linkQueue?: LinkQueue
      lockfileRepository?: LockfileRepository
    } = {},
  ) {
    this.resolveQueue = options.resolveQueue ?? new ResolveQueue()
    this.fetchQueue = options.fetchQueue ?? new FetchQueue(options.hooks)
    this.linkQueue = options.linkQueue ?? new LinkQueue()
  }

  async materialize(options: {
    rootDir: string
    manifest: Manifest
    lockfile: Lockfile
    onProgress?: InstallProgressListener
  }) {
    const fetched = await this.fetchQueue.run(options)
    await this.linkQueue.run({
      rootDir: options.rootDir,
      manifest: options.manifest,
      fetched: fetched.fetched,
      onProgress: options.onProgress,
    })

    return fetched
  }

  async installConfig(
    config: Config,
    options: {
      frozenLockfile?: boolean
      onProgress?: InstallProgressListener
      persistLockfile?: boolean
    } = {},
  ) {
    if (!config.manifest) {
      return { status: 'skipped', reason: 'manifest-missing' } as const
    }

    let lockfile: Lockfile
    if (options.frozenLockfile) {
      if (!config.lockfile) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_NOT_FOUND,
          filePath: `${config.rootDir}/skills-lock.yaml`,
          message:
            'Lockfile is required in frozen mode but none was found. Run "spm install" first.',
        })
      }
      if (!(await config.lockfile.isInSyncWith(config.manifest, config.rootDir))) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_OUTDATED,
          filePath: `${config.rootDir}/skills-lock.yaml`,
          message:
            'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
        })
      }
      lockfile = config.lockfile
      for (const skillName of lockfile.skillNames()) {
        options.onProgress?.({ type: 'resolved', skillName })
      }
    } else {
      lockfile = await this.resolveQueue.syncLockfile({
        rootDir: config.rootDir,
        manifest: config.manifest,
        currentLock: config.lockfile,
        onProgress: options.onProgress,
      })
    }

    const runtimeLock = await this.resolveQueue.createRuntimeLockfile({
      rootDir: config.rootDir,
      manifest: config.manifest,
      lockfile,
    })

    await this.materialize({
      rootDir: config.rootDir,
      manifest: config.manifest,
      lockfile: runtimeLock,
      onProgress: options.onProgress,
    })

    if (options.persistLockfile !== false && !options.frozenLockfile) {
      await (this.options.lockfileRepository ?? new LockfileRepository()).write(
        config.rootDir,
        lockfile,
      )
    }

    return {
      status: 'installed',
      installed: runtimeLock.skillNames(),
      lockfile,
      runtimeLock,
    } as const
  }
}

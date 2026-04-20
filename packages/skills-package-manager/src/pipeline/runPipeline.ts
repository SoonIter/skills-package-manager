import type { InstallProgressListener, SkillsLock, SkillsManifest } from '../config/types'
import type { Lockfile } from '../structures/Lockfile'
import type { Manifest } from '../structures/Manifest'
import { FetchQueue } from './FetchQueue'
import { LinkTaskQueue } from './LinkTaskQueue'

export type PipelineHooks = {
  beforeFetch?: (rootDir: string, manifest: SkillsManifest, lockfile: SkillsLock) => Promise<void>
}

export async function runFetchPipeline(options: {
  rootDir: string
  manifest: Manifest
  lockfile: Lockfile
  currentInstallState?: import('../install/installState').InstallState | null
  onProgress?: InstallProgressListener
  hooks?: PipelineHooks
}) {
  return new FetchQueue({
    beforeFetch: async (cwd, manifest, lockfile) =>
      options.hooks?.beforeFetch?.(
        cwd,
        manifest.toJSON({ includeDefaults: true }),
        lockfile.toJSON(),
      ),
  }).run({
    rootDir: options.rootDir,
    manifest: options.manifest,
    lockfile: options.lockfile,
    currentInstallState: options.currentInstallState,
    onProgress: options.onProgress,
  })
}

export async function runLinkPipeline(options: {
  rootDir: string
  manifest: Manifest
  fetched: import('./FetchQueue').FetchedSkill[]
  onProgress?: InstallProgressListener
}) {
  return new LinkTaskQueue().run(options)
}

export async function runResolvedPipeline(options: {
  rootDir: string
  manifest: Manifest
  lockfile: Lockfile
  currentInstallState?: import('../install/installState').InstallState | null
  onProgress?: InstallProgressListener
  hooks?: PipelineHooks
}) {
  const fetchResult = await runFetchPipeline(options)
  const linked = await runLinkPipeline({
    rootDir: options.rootDir,
    manifest: options.manifest,
    fetched: fetchResult.fetched,
    onProgress: options.onProgress,
  })

  return {
    fetchResult,
    linked,
  }
}

import type {
  InstallProgressEvent,
  NormalizedSkillsManifest,
  SkillsLock,
  SkillsLockEntry,
} from '../config/types'
import type { NpmConfig } from '../npm/packPackage'

export type { NpmConfig } from '../npm/packPackage'

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export interface CacheManager {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  getOrSet<T extends string>(key: string, factory: () => Promise<T>): Promise<T>
}

// ---------------------------------------------------------------------------
// WorkspaceContext
// ---------------------------------------------------------------------------

export interface WorkspaceContext {
  cwd: string
  manifest: NormalizedSkillsManifest
  manifestExists: boolean
  lockfile: SkillsLock | null
  npmConfig: NpmConfig
  installState: InstallState | null
  cache: CacheManager
}

export interface InstallState {
  lockDigest: string
  installDir: string
  linkTargets: string[]
  installerVersion: string
  installedAt: string
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface ResolveTask {
  skillName: string
  specifier: string
}

export interface ResolveResult {
  skillName: string
  entry: SkillsLockEntry
}

export interface FetchTask {
  skillName: string
  entry: SkillsLockEntry
}

export interface FetchResult {
  skillName: string
  entry: SkillsLockEntry
  installPath: string
}

export interface LinkTask {
  skillName: string
  entry: SkillsLockEntry
  installPath: string
}

export interface LinkResult {
  skillName: string
}

// ---------------------------------------------------------------------------
// PipelineBus
// ---------------------------------------------------------------------------

export interface PipelineBus {
  emitResolved(result: ResolveResult): void
  emitFetched(result: FetchResult): void
  emitLinked(result: LinkResult): void
  onProgress(event: InstallProgressEvent): void
  getResults(): PipelineResult
}

export interface PipelineResult {
  resolved: ResolveResult[]
  fetched: FetchResult[]
  linked: LinkResult[]
}

// ---------------------------------------------------------------------------
// Queue options
// ---------------------------------------------------------------------------

export interface QueueOptions {
  concurrency: number
  maxPending?: number
}

export interface PipelineOptions {
  onProgress?: (event: InstallProgressEvent) => void
  resolveConcurrency?: number
  fetchConcurrency?: number
  linkConcurrency?: number
}

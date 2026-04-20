import type {
  LockEntryData,
  LockfileData,
  ManifestData,
  NormalizedManifestData,
  SpecifierData,
} from '../structures/types'

export type SkillsManifest = ManifestData
export type NormalizedSkillsManifest = NormalizedManifestData
export type NormalizedSpecifier = SpecifierData
export type SkillsLockEntry = LockEntryData
export type SkillsLock = LockfileData

export type InitCommandOptions = {
  cwd: string
  yes?: boolean
}

export type AddCommandOptions = {
  cwd: string
  specifier: string
  skill?: string
  global?: boolean
  yes?: boolean
  agent?: string[]
}

export type UpdateCommandOptions = {
  cwd: string
  skills?: string[]
}

export type PatchCommandOptions = {
  cwd: string
  skillName: string
  editDir?: string
  ignoreExisting?: boolean
}

export type PatchCommandResult = {
  status: 'patched'
  skillName: string
  editDir: string
  originalSpecifier: string
}

export type PatchCommitCommandOptions = {
  cwd: string
  editDir: string
  patchesDir?: string
}

export type PatchCommitCommandResult = {
  status: 'patched'
  skillName: string
  patchFile: string
}

export type UpdateCommandResult = {
  status: 'updated' | 'skipped' | 'failed'
  updated: string[]
  unchanged: string[]
  skipped: Array<{ name: string; reason: 'link-specifier' }>
  failed: Array<{ name: string; reason: string }>
}

export type InstallCommandOptions = {
  cwd: string
  frozenLockfile?: boolean
}

export type InstallProgressEvent =
  | { type: 'resolved'; skillName: string }
  | { type: 'added'; skillName: string }
  | { type: 'installed'; skillName: string }

export type InstallProgressListener = (event: InstallProgressEvent) => void

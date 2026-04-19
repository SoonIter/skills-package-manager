import type { z } from 'zod'
import type { skillsManifestSchema } from './schema'

/**
 * Skills manifest input type used for authoring/writing manifests.
 * This preserves optionality for schema fields with defaults.
 * See schema.ts for the source of truth.
 */
export type SkillsManifest = z.input<typeof skillsManifestSchema>

/**
 * Skills manifest output type after schema parsing/default application.
 * Use this for normalized manifests returned from reads/parsing.
 * See schema.ts for the source of truth.
 */
export type NormalizedSkillsManifest = z.output<typeof skillsManifestSchema>

export type NormalizedSpecifier = {
  type: 'git' | 'link' | 'file' | 'npm'
  source: string
  ref: string | null
  path: string
  normalized: string
  skillName: string
}

export type SkillsLockEntry = {
  specifier: string
  resolution:
    | { type: 'link'; path: string }
    | { type: 'file'; tarball: string; path: string }
    | { type: 'git'; url: string; commit: string; path: string }
    | {
        type: 'npm'
        packageName: string
        version: string
        path: string
        tarball: string
        integrity?: string
        registry?: string
      }
  digest: string
  patch?: {
    path: string
    digest: string
  }
}

export type SkillsLock = {
  lockfileVersion: '0.1'
  installDir: string
  linkTargets: string[]
  skills: Record<string, SkillsLockEntry>
}

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

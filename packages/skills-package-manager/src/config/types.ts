export type SkillsManifest = {
  $schema?: string
  installDir?: string
  linkTargets?: string[]
  skills: Record<string, string>
}

export type NormalizedSpecifier = {
  type: 'git' | 'file' | 'npm'
  source: string
  ref: string | null
  path: string
  normalized: string
  skillName: string
}

export type SkillsLockEntry = {
  specifier: string
  resolution:
    | { type: 'file'; path: string }
    | { type: 'git'; url: string; commit: string; path: string }
    | { type: 'npm'; packageName: string; version: string; path: string; integrity?: string }
  digest: string
}

export type SkillsLock = {
  lockfileVersion: '0.1'
  installDir: string
  linkTargets: string[]
  skills: Record<string, SkillsLockEntry>
}

export type AddCommandOptions = {
  cwd: string
  specifier: string
  skill?: string
}

export type UpdateCommandOptions = {
  cwd: string
  skills?: string[]
}

export type UpdateCommandResult = {
  status: 'updated' | 'skipped' | 'failed'
  updated: string[]
  unchanged: string[]
  skipped: Array<{ name: string; reason: 'file-specifier' }>
  failed: Array<{ name: string; reason: string }>
}

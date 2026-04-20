export type ManifestData = {
  $schema?: string
  installDir?: string
  linkTargets?: string[]
  selfSkill?: boolean
  skills?: Record<string, string>
  patchedSkills?: Record<string, string>
}

export type NormalizedManifestData = {
  $schema?: string
  installDir: string
  linkTargets: string[]
  selfSkill?: boolean
  skills: Record<string, string>
  patchedSkills?: Record<string, string>
}

export type SpecifierType = 'git' | 'link' | 'file' | 'npm'

export type SpecifierData = {
  type: SpecifierType
  source: string
  ref: string | null
  path: string
  normalized: string
  skillName: string
}

export type LinkResolutionData = {
  type: 'link'
  path: string
}

export type FileResolutionData = {
  type: 'file'
  tarball: string
  path: string
}

export type GitResolutionData = {
  type: 'git'
  url: string
  commit: string
  path: string
}

export type NpmResolutionData = {
  type: 'npm'
  packageName: string
  version: string
  path: string
  tarball: string
  integrity?: string
  registry?: string
}

export type ResolutionData =
  | LinkResolutionData
  | FileResolutionData
  | GitResolutionData
  | NpmResolutionData

export type LockEntryPatchData = {
  path: string
  digest: string
}

export type LockEntryData = {
  specifier: string
  resolution: ResolutionData
  digest: string
  patch?: LockEntryPatchData
}

export type LockfileData = {
  lockfileVersion: '0.1'
  installDir: string
  linkTargets: string[]
  skills: Record<string, LockEntryData>
}

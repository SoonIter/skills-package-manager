import type { InstallState } from '../install/installState'
import { type NormalizedNpmConfig, type NpmConfig, normalizeNpmConfig } from '../npm/config'
import type { Lockfile } from './Lockfile'
import type { Manifest } from './Manifest'
import type { LockfileData, NormalizedManifestData } from './types'

export type NormalizedConfig = {
  rootDir: string
  manifest: NormalizedManifestData | null
  lockfile: LockfileData | null
  npmConfig: NormalizedNpmConfig
  installState: InstallState | null
}

export class Config {
  readonly rootDir: string
  readonly manifest: Manifest | null
  readonly lockfile: Lockfile | null
  readonly npmConfig: NpmConfig
  readonly installState: InstallState | null

  constructor(input: {
    rootDir: string
    manifest: Manifest | null
    lockfile: Lockfile | null
    npmConfig: NpmConfig
    installState: InstallState | null
  }) {
    this.rootDir = input.rootDir
    this.manifest = input.manifest
    this.lockfile = input.lockfile
    this.npmConfig = input.npmConfig
    this.installState = input.installState
  }

  normalize(): NormalizedConfig {
    return {
      rootDir: this.rootDir,
      manifest: this.manifest ? this.manifest.normalize() : null,
      lockfile: this.lockfile ? this.lockfile.toJSON() : null,
      npmConfig: normalizeNpmConfig(this.npmConfig),
      installState: this.installState,
    }
  }
}

import type { Lockfile } from './Lockfile'
import type { Manifest } from './Manifest'

export class Config {
  readonly rootDir: string
  readonly manifest: Manifest | null
  readonly lockfile: Lockfile | null

  constructor(input: { rootDir: string; manifest: Manifest | null; lockfile: Lockfile | null }) {
    this.rootDir = input.rootDir
    this.manifest = input.manifest
    this.lockfile = input.lockfile
  }

  normalize(): {
    rootDir: string
    manifest: ReturnType<Manifest['normalize']> | null
    lockfile: ReturnType<Lockfile['toJSON']> | null
  } {
    return {
      rootDir: this.rootDir,
      manifest: this.manifest ? this.manifest.normalize() : null,
      lockfile: this.lockfile ? this.lockfile.toJSON() : null,
    }
  }
}

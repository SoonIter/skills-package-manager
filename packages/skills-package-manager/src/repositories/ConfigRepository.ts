import { Config } from '../structures/Config'
import { LockfileRepository } from './LockfileRepository'
import { ManifestRepository } from './ManifestRepository'

export class ConfigRepository {
  constructor(
    private readonly manifestRepository = new ManifestRepository(),
    private readonly lockfileRepository = new LockfileRepository(),
  ) {}

  async load(rootDir: string): Promise<Config> {
    const [manifest, lockfile] = await Promise.all([
      this.manifestRepository.read(rootDir),
      this.lockfileRepository.read(rootDir),
    ])

    return new Config({
      rootDir,
      manifest,
      lockfile,
    })
  }
}

import { readInstallState } from '../install/installState'
import { readNpmConfig } from '../npm/config'
import { LockfileRepository } from '../repositories/LockfileRepository'
import { ManifestRepository } from '../repositories/ManifestRepository'
import { Config } from '../structures/Config'

export async function loadConfig(
  rootDir: string,
  repositories = {
    manifestRepository: new ManifestRepository(),
    lockfileRepository: new LockfileRepository(),
  },
): Promise<Config> {
  const [manifest, lockfile, npmConfig] = await Promise.all([
    repositories.manifestRepository.read(rootDir),
    repositories.lockfileRepository.read(rootDir),
    readNpmConfig(rootDir),
  ])

  const installDir = manifest?.normalize().installDir ?? lockfile?.installDir
  const installState = installDir ? await readInstallState(rootDir, installDir) : null

  return new Config({
    rootDir,
    manifest,
    lockfile,
    npmConfig,
    installState,
  })
}

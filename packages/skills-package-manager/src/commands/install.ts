import type { InstallCommandOptions } from '../config/types'
import { ErrorCode, ManifestError } from '../errors'
import { createInstallProgressReporter } from '../install/progressReporter'
import { Installer } from '../pipeline/Installer'
import { ConfigRepository } from '../repositories/ConfigRepository'

export async function installCommand(options: InstallCommandOptions) {
  const config = await new ConfigRepository().load(options.cwd)
  if (!config.manifest) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  const reporter = createInstallProgressReporter()
  const onProgress = (event: Parameters<typeof reporter.onProgress>[0]) =>
    reporter.onProgress(event)
  let started = false

  try {
    const installer = new Installer()
    reporter.start(Object.keys(config.manifest.withBundledSelfSkill().normalize().skills).length)
    started = true

    const result = await installer.installConfig(config, {
      frozenLockfile: options.frozenLockfile,
      onProgress,
    })

    reporter.complete()

    if (result.status !== 'installed') {
      return result
    }

    return { status: 'installed', installed: result.installed } as const
  } catch (error) {
    if (started) {
      reporter.fail()
    }
    throw error
  }
}

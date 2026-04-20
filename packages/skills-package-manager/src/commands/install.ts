import type { InstallCommandOptions } from '../config/types'
import { ErrorCode, ManifestError } from '../errors'
import { installStageHooks } from '../install/installSkills'
import { createInstallProgressReporter } from '../install/progressReporter'
import { loadConfig } from '../pipeline/loadConfig'
import { ResolveQueue } from '../pipeline/ResolveQueue'
import { runResolvedPipeline } from '../pipeline/runPipeline'
import { LockfileRepository } from '../repositories/LockfileRepository'
import type { Lockfile } from '../structures/Lockfile'

export async function installCommand(options: InstallCommandOptions) {
  const config = await loadConfig(options.cwd)
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
    const resolveQueue = new ResolveQueue()
    reporter.start(Object.keys(config.manifest.withBundledSelfSkill().normalize().skills).length)
    started = true
    let lockfile: Lockfile

    if (options.frozenLockfile) {
      if (!config.lockfile) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_NOT_FOUND,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is required in frozen mode but none was found. Run "spm install" first.',
        })
      }
      if (!(await config.lockfile.isInSyncWith(config.manifest, config.rootDir))) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_OUTDATED,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
        })
      }
      lockfile = config.lockfile
      for (const skillName of lockfile.skillNames()) {
        onProgress({ type: 'resolved', skillName })
      }
    } else {
      lockfile = await resolveQueue.syncLockfile({
        rootDir: config.rootDir,
        manifest: config.manifest,
        currentLock: config.lockfile,
        onProgress,
        npmConfig: config.npmConfig,
      })
    }

    const runtimeLock = await resolveQueue.createRuntimeLockfile({
      rootDir: config.rootDir,
      manifest: config.manifest,
      lockfile,
      npmConfig: config.npmConfig,
    })

    await runResolvedPipeline({
      rootDir: config.rootDir,
      manifest: config.manifest,
      lockfile: runtimeLock,
      currentInstallState: config.installState,
      onProgress,
      hooks: {
        beforeFetch: installStageHooks.beforeFetch,
      },
    })

    if (!options.frozenLockfile) {
      await new LockfileRepository().write(config.rootDir, lockfile)
    }

    reporter.complete()
    return { status: 'installed', installed: runtimeLock.skillNames() } as const
  } catch (error) {
    if (started) {
      reporter.fail()
    }
    throw error
  }
}

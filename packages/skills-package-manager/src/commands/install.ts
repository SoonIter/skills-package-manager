import { isLockInSync } from '../config/compareSkillsLock'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { InstallCommandOptions, SkillsLock } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { ErrorCode, ManifestError } from '../errors'
import { createInstallProgressReporter } from '../install/progressReporter'
import { withBundledSelfSkillLock } from '../install/withBundledSelfSkillLock'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'

export async function installCommand(options: InstallCommandOptions) {
  const ctx = await loadConfig(options.cwd)

  if (!ctx.manifestExists) {
    return { status: 'skipped' as const, reason: 'manifest-missing' }
  }

  const reporter = createInstallProgressReporter()
  const onProgress = (event: Parameters<typeof reporter.onProgress>[0]) => {
    reporter.onProgress(event)
    options.onProgress?.(event)
  }
  let started = false

  try {
    let lockfile: SkillsLock
    let skipResolve = false

    if (options.frozenLockfile) {
      // Frozen mode: lock must exist and be in sync
      if (!ctx.lockfile) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_NOT_FOUND,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is required in frozen mode but none was found. Run "spm install" first.',
        })
      }
      if (!(await isLockInSync(options.cwd, ctx.manifest, ctx.lockfile))) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_OUTDATED,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
        })
      }
      lockfile = ctx.lockfile
      skipResolve = true
    } else {
      // Normal mode: sync lock with manifest (may trigger network requests)
      lockfile = await syncSkillsLock(options.cwd, ctx.manifest, ctx.lockfile, {
        onProgress,
      })
    }

    const runtimeLock = await withBundledSelfSkillLock(options.cwd, ctx.manifest, lockfile)

    reporter.start(Object.keys(runtimeLock.skills).length)
    started = true

    if (skipResolve) {
      for (const skillName of Object.keys(lockfile.skills)) {
        onProgress({ type: 'resolved', skillName })
      }
    }

    reporter.setPhase('fetching')
    await runPipeline({
      ctx,
      entries: runtimeLock.skills,
      skipResolve,
      options: { onProgress },
    })

    reporter.setPhase('finalizing')
    if (!options.frozenLockfile) {
      await writeSkillsLock(options.cwd, lockfile)
    }
    reporter.complete()

    return { status: 'installed' as const, installed: Object.keys(runtimeLock.skills) }
  } catch (error) {
    if (started) {
      reporter.fail()
    }
    throw error
  }
}

import { resolveSkillsPlan } from '../config/resolveSkillsPlan'
import {
  areManifestDependenciesEqual,
  resolveManifestDependencies,
} from '../config/skillDependencies'
import type { InstallCommandOptions } from '../config/types'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { createInstallProgressReporter } from '../install/progressReporter'
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
    const dependencyResult = await resolveManifestDependencies(options.cwd, ctx.manifest, {
      onWarning: options.onWarning,
    })
    const nextManifest = dependencyResult.manifest
    const plan = await resolveSkillsPlan(options.cwd, nextManifest)

    reporter.start(Object.keys(plan.skills).length)
    started = true
    for (const skillName of Object.keys(plan.skills)) {
      onProgress({ type: 'resolved', skillName })
    }

    reporter.setPhase('fetching')
    await runPipeline({
      ctx: {
        ...ctx,
        manifest: nextManifest,
      },
      plan,
      skipResolve: true,
      options: { onProgress },
    })

    reporter.setPhase('finalizing')
    reporter.complete()

    if (!areManifestDependenciesEqual(ctx.manifest, nextManifest)) {
      await writeSkillsManifest(options.cwd, nextManifest)
    }

    return {
      status: 'installed' as const,
      installed: Object.keys(plan.skills),
      warnings: dependencyResult.warnings,
    }
  } catch (error) {
    if (started) {
      reporter.fail()
    }
    throw error
  }
}

import { bootstrapSkillsManifest } from '../config/bootstrapSkillsManifest'
import { resolveSkillsPlan } from '../config/resolveSkillsPlan'
import type { InstallCommandOptions } from '../config/types'
import { createInstallProgressReporter } from '../install/progressReporter'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'

export async function installCommand(options: InstallCommandOptions) {
  let ctx = await loadConfig(options.cwd)

  if (!ctx.manifestExists) {
    ctx = {
      ...ctx,
      manifest: await bootstrapSkillsManifest(options.cwd),
      manifestExists: true,
    }
  }

  const reporter = createInstallProgressReporter()
  const onProgress = (event: Parameters<typeof reporter.onProgress>[0]) => {
    reporter.onProgress(event)
    options.onProgress?.(event)
  }
  let started = false

  try {
    const plan = await resolveSkillsPlan(options.cwd, ctx.manifest)

    reporter.start(Object.keys(plan.skills).length)
    started = true
    for (const skillName of Object.keys(plan.skills)) {
      onProgress({ type: 'resolved', skillName })
    }

    reporter.setPhase('fetching')
    await runPipeline({
      ctx,
      plan,
      skipResolve: true,
      options: { onProgress },
    })

    reporter.setPhase('finalizing')
    reporter.complete()

    return { status: 'installed' as const, installed: Object.keys(plan.skills) }
  } catch (error) {
    if (started) {
      reporter.fail()
    }
    throw error
  }
}

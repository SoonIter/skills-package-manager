import type { ResolvedSkillsPlan } from '../config/types'
import { ErrorCode, getErrorMessage, SpmError } from '../errors'
import { installStageHooks } from '../install/installPlan'
import { ensureLocalSkillGitignoreRules, getLocalSkillDirs } from '../install/localSkills'
import { pruneManagedSkills } from '../install/pruneManagedSkills'
import { createPipelineBus } from './bus'
import { createFetchTaskQueue } from './fetchQueue'
import { createLinkTaskQueue } from './linkQueue'
import { createResolveTaskQueue } from './resolveQueue'
import type { PipelineOptions, PipelineResult, WorkspaceContext } from './types'

export interface RunPipelineInput {
  ctx: WorkspaceContext
  plan: ResolvedSkillsPlan
  skipResolve?: boolean
  options?: PipelineOptions
}

export async function runPipeline(input: RunPipelineInput): Promise<PipelineResult> {
  const { ctx, plan, skipResolve = false, options = {} } = input
  const { skills: entries, installDir, linkTargets } = plan
  const bus = createPipelineBus(options.onProgress)
  const errors: unknown[] = []

  const resolveQueue = createResolveTaskQueue(ctx, bus, {
    concurrency: options.resolveConcurrency ?? 8,
    maxPending: 40,
  })

  const fetchQueue = createFetchTaskQueue(ctx, bus, {
    concurrency: options.fetchConcurrency ?? 4,
    maxPending: 20,
    installDir,
  })

  const linkQueue = createLinkTaskQueue(ctx, bus, {
    concurrency: options.linkConcurrency ?? 16,
    maxPending: 20,
    installDir,
    linkTargets,
  })

  // Backpressure wiring
  fetchQueue.onBackpressure(() => resolveQueue.pause())
  fetchQueue.onDrain(() => resolveQueue.resume())

  linkQueue.onBackpressure(() => fetchQueue.pause())
  linkQueue.onDrain(() => fetchQueue.resume())

  // Pipeline wiring: resolved → fetch → link
  const originalEmitResolved = bus.emitResolved.bind(bus)
  bus.emitResolved = (result) => {
    if (!skipResolve) {
      originalEmitResolved(result)
    }
    fetchQueue
      .enqueue({
        skillName: result.skillName,
        entry: result.entry,
      })
      .catch((error) => {
        errors.push(error)
      })
  }

  const originalEmitFetched = bus.emitFetched.bind(bus)
  bus.emitFetched = (result) => {
    originalEmitFetched(result)
    linkQueue
      .enqueue({
        skillName: result.skillName,
        entry: result.entry,
        installPath: result.installPath,
      })
      .catch((error) => {
        errors.push(error)
      })
  }

  const skillNames = Object.keys(entries)

  await installStageHooks.beforeFetch(ctx.cwd, ctx.manifest, plan)

  await ensureLocalSkillGitignoreRules(ctx.cwd, plan)
  await pruneManagedSkills(
    ctx.cwd,
    installDir,
    linkTargets,
    skillNames,
    getLocalSkillDirs(ctx.cwd, [plan]),
  )

  if (skipResolve) {
    for (const [skillName, entry] of Object.entries(entries)) {
      bus.emitResolved({ skillName, entry })
    }
  } else {
    for (const [skillName, specifier] of Object.entries(ctx.manifest.skills)) {
      resolveQueue.enqueue({ skillName, specifier }).catch((error) => {
        errors.push(error)
      })
    }

    for (const [skillName, entry] of Object.entries(entries)) {
      if (!(skillName in ctx.manifest.skills)) {
        bus.emitResolved({ skillName, entry })
      }
    }
  }

  await resolveQueue.drain()
  await fetchQueue.drain()
  await linkQueue.drain()

  if (errors.length > 0) {
    const first = errors[0]
    if (errors.length === 1) {
      throw first
    }
    throw new SpmError({
      code: ErrorCode.INSTALL_ERROR,
      message: `${errors.length} skills failed to install`,
      cause: first instanceof Error ? first : undefined,
      context: { errors: errors.map(getErrorMessage) },
    })
  }

  return bus.getResults()
}

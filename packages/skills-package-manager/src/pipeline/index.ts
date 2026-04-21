import type { SkillsLock, SkillsLockEntry } from '../config/types'
import { writeInstallState } from '../install/installState'
import { pruneManagedSkills } from '../install/pruneManagedSkills'
import { installStageHooks } from '../install/withBundledSelfSkillLock'
import { sha256 } from '../utils/hash'
import { createPipelineBus } from './bus'
import { createFetchTaskQueue } from './fetchQueue'
import { createLinkTaskQueue } from './linkQueue'
import { createResolveTaskQueue } from './resolveQueue'
import type { PipelineOptions, PipelineResult, WorkspaceContext } from './types'

export interface RunPipelineInput {
  ctx: WorkspaceContext
  entries: Record<string, SkillsLockEntry>
  skipResolve?: boolean
  options?: PipelineOptions
}

export async function runPipeline(input: RunPipelineInput): Promise<PipelineResult> {
  const { ctx, entries, skipResolve = false, options = {} } = input
  const bus = createPipelineBus(options.onProgress)
  const errors: unknown[] = []

  const installDir = ctx.lockfile?.installDir ?? ctx.manifest.installDir ?? '.agents/skills'
  const linkTargets = ctx.lockfile?.linkTargets ?? ctx.manifest.linkTargets ?? []

  const resolveQueue = createResolveTaskQueue(ctx, bus, {
    concurrency: options.resolveConcurrency ?? 8,
    maxPending: 40,
  })

  const fetchQueue = createFetchTaskQueue(ctx, bus, {
    concurrency: options.fetchConcurrency ?? 4,
    maxPending: 20,
  })

  const linkQueue = createLinkTaskQueue(ctx, bus, {
    concurrency: options.linkConcurrency ?? 16,
    maxPending: 20,
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

  await installStageHooks.beforeFetch(ctx.cwd, ctx.manifest, {
    lockfileVersion: '0.1',
    installDir,
    linkTargets,
    skills: entries,
  })

  await pruneManagedSkills(ctx.cwd, installDir, linkTargets, skillNames)

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
    throw errors[0]
  }

  const results = bus.getResults()
  if (results.resolved.length > 0 || results.fetched.length > 0 || skipResolve) {
    const lockfile: SkillsLock = {
      lockfileVersion: '0.1',
      installDir,
      linkTargets,
      skills: skipResolve
        ? entries
        : Object.fromEntries(results.resolved.map((r) => [r.skillName, r.entry])),
    }
    const lockDigest = sha256(JSON.stringify(lockfile))
    await writeInstallState(ctx.cwd, installDir, {
      lockDigest,
      installDir,
      linkTargets,
      installerVersion: '0.1.0',
      installedAt: new Date().toISOString(),
    })
  }

  return results
}

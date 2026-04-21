import path from 'node:path'
import { fetchSkill } from '../fetchers'
import { applySkillPatch } from '../patches/skillPatch'
import { createTaskQueue, type TaskQueue } from './queue'
import type { FetchResult, FetchTask, PipelineBus, WorkspaceContext } from './types'

export type FetchQueue = TaskQueue<FetchTask, FetchResult>

export function createFetchTaskQueue(
  ctx: WorkspaceContext,
  bus: PipelineBus,
  options: { concurrency: number; maxPending?: number },
): FetchQueue {
  const installDir = ctx.manifest.installDir ?? '.agents/skills'

  async function processor(task: FetchTask): Promise<FetchResult> {
    const installPath = await fetchSkill(ctx.cwd, task.skillName, task.entry, installDir, ctx.cache)

    if (task.entry.patch) {
      await applySkillPatch(installPath, path.resolve(ctx.cwd, task.entry.patch.path))
    }

    const result: FetchResult = {
      skillName: task.skillName,
      entry: task.entry,
      installPath,
    }
    bus.emitFetched(result)
    return result
  }

  return createTaskQueue(processor, options)
}

import { createInstallError } from '../errors'
import { linkSkill } from '../install/links'
import { createTaskQueue, type TaskQueue } from './queue'
import type { LinkResult, LinkTask, PipelineBus, WorkspaceContext } from './types'

export type LinkQueue = TaskQueue<LinkTask, LinkResult>

export function createLinkTaskQueue(
  ctx: WorkspaceContext,
  bus: PipelineBus,
  options: { concurrency: number; maxPending?: number; installDir: string; linkTargets: string[] },
): LinkQueue {
  const { installDir, linkTargets } = options

  async function processor(task: LinkTask): Promise<LinkResult> {
    try {
      for (const linkTarget of linkTargets) {
        await linkSkill(ctx.cwd, installDir, linkTarget, task.skillName, task.installPath)
      }

      const result: LinkResult = { skillName: task.skillName }
      bus.emitLinked(result)
      return result
    } catch (error) {
      throw createInstallError('link', task.skillName, error)
    }
  }

  return createTaskQueue(processor, options)
}

import { ErrorCode, SpmError } from '../errors'
import { linkSkill } from '../install/links'
import { createTaskQueue, type TaskQueue } from './queue'
import type { LinkResult, LinkTask, PipelineBus, WorkspaceContext } from './types'

export type LinkQueue = TaskQueue<LinkTask, LinkResult>

export function createLinkTaskQueue(
  ctx: WorkspaceContext,
  bus: PipelineBus,
  options: { concurrency: number; maxPending?: number },
): LinkQueue {
  const installDir = ctx.lockfile?.installDir ?? ctx.manifest.installDir ?? '.agents/skills'
  const linkTargets = ctx.lockfile?.linkTargets ?? ctx.manifest.linkTargets ?? []

  async function processor(task: LinkTask): Promise<LinkResult> {
    try {
      for (const linkTarget of linkTargets) {
        await linkSkill(ctx.cwd, installDir, linkTarget, task.skillName)
      }

      const result: LinkResult = { skillName: task.skillName }
      bus.emitLinked(result)
      return result
    } catch (error) {
      throw new SpmError({
        code: ErrorCode.INSTALL_ERROR,
        message: `Failed to link skill "${task.skillName}": ${error instanceof Error ? error.message : String(error)}`,
        cause: error instanceof Error ? error : undefined,
        context: { skillName: task.skillName, phase: 'link' },
      })
    }
  }

  return createTaskQueue(processor, options)
}

import type { NormalizedSpecifier } from '../config/types'
import { ErrorCode, ParseError } from '../errors'
import { resolveEntry } from '../resolvers'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { createTaskQueue, type TaskQueue } from './queue'
import type { PipelineBus, ResolveResult, ResolveTask, WorkspaceContext } from './types'

export type ResolveQueue = TaskQueue<ResolveTask, ResolveResult>

export function createResolveTaskQueue(
  _ctx: WorkspaceContext,
  bus: PipelineBus,
  options: { concurrency: number; maxPending?: number },
): ResolveQueue {
  async function processor(task: ResolveTask): Promise<ResolveResult> {
    let normalized: NormalizedSpecifier
    try {
      normalized = normalizeSpecifier(task.specifier)
    } catch (error) {
      if (error instanceof ParseError) {
        throw error
      }
      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message: `Failed to parse specifier "${task.specifier}": ${(error as Error).message}`,
        content: task.specifier,
        cause: error as Error,
      })
    }

    const { skillName, entry } = await resolveEntry(_ctx.cwd, normalized, task.skillName)

    const result: ResolveResult = { skillName, entry }
    bus.emitResolved(result)
    return result
  }

  return createTaskQueue(processor, options)
}

import { access, lstat, readFile, readlink } from 'node:fs/promises'
import path from 'node:path'
import { createInstallError } from '../errors'
import { fetchSkill } from '../fetchers'
import { applySkillPatch } from '../patches/skillPatch'
import { createTaskQueue, type TaskQueue } from './queue'
import type { FetchResult, FetchTask, PipelineBus, WorkspaceContext } from './types'

export type FetchQueue = TaskQueue<FetchTask, FetchResult>

async function isSkillUpToDate(
  rootDir: string,
  installDir: string,
  skillName: string,
  entry: FetchTask['entry'],
): Promise<boolean> {
  const skillDir = path.join(rootDir, installDir, skillName)

  try {
    const stats = await lstat(skillDir)

    if (entry.resolution.type === 'link') {
      if (!stats.isSymbolicLink()) return false
      const target = await readlink(skillDir)
      const resolvedTarget = path.resolve(path.dirname(skillDir), target)
      const expectedTarget = path.resolve(rootDir, entry.resolution.path)
      return resolvedTarget === expectedTarget
    }

    // A marker alone is not sufficient — verify the skill content is present
    await access(path.join(skillDir, 'SKILL.md'))

    const markerPath = path.join(skillDir, '.skills-pm.json')
    let marker: { installedBy?: string; digest?: string } | undefined
    try {
      marker = JSON.parse(await readFile(markerPath, 'utf8'))
    } catch {
      return false
    }
    return marker?.installedBy === 'skills-package-manager' && marker?.digest === entry.digest
  } catch {
    return false
  }
}

export function createFetchTaskQueue(
  ctx: WorkspaceContext,
  bus: PipelineBus,
  options: { concurrency: number; maxPending?: number },
): FetchQueue {
  const installDir = ctx.manifest.installDir ?? '.agents/skills'

  async function processor(task: FetchTask): Promise<FetchResult> {
    if (await isSkillUpToDate(ctx.cwd, installDir, task.skillName, task.entry)) {
      const result: FetchResult = {
        skillName: task.skillName,
        entry: task.entry,
        installPath: path.join(ctx.cwd, installDir, task.skillName),
        skipped: true,
      }
      bus.emitFetched(result)
      return result
    }

    try {
      const { installPath, fromCache } = await fetchSkill(
        ctx.cwd,
        task.skillName,
        task.entry,
        installDir,
        ctx.cache,
      )

      if (task.entry.patch) {
        await applySkillPatch(installPath, path.resolve(ctx.cwd, task.entry.patch.path))
      }

      const result: FetchResult = {
        skillName: task.skillName,
        entry: task.entry,
        installPath,
        fromCache,
      }
      bus.emitFetched(result)
      return result
    } catch (error) {
      throw createInstallError('fetch', task.skillName, error)
    }
  }

  return createTaskQueue(processor, options)
}

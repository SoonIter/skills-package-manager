import type { UpdateCommandOptions, UpdateCommandResult } from '../config/types'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { installStageHooks } from '../install/installSkills'
import { loadConfig } from '../pipeline/loadConfig'
import { ResolveQueue } from '../pipeline/ResolveQueue'
import { runResolvedPipeline } from '../pipeline/runPipeline'
import { LockfileRepository } from '../repositories/LockfileRepository'
import { Specifier } from '../structures/Specifier'
import { stableStringify } from '../utils/stableStringify'

function createEmptyResult(): UpdateCommandResult {
  return {
    status: 'skipped',
    updated: [],
    unchanged: [],
    skipped: [],
    failed: [],
  }
}

export async function updateCommand(options: UpdateCommandOptions): Promise<UpdateCommandResult> {
  const config = await loadConfig(options.cwd)
  if (!config.manifest) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  const targetSkills = options.skills ?? Object.keys(config.manifest.normalize().skills)
  for (const skillName of targetSkills) {
    if (!config.manifest.hasSkill(skillName)) {
      throw new SkillError({
        code: ErrorCode.SKILL_NOT_FOUND,
        skillName,
        message: `Unknown skill: ${skillName}`,
      })
    }
  }

  const result = createEmptyResult()
  const resolveQueue = new ResolveQueue()
  let candidateLock = config.lockfile?.clone()
  if (!candidateLock) {
    candidateLock = await resolveQueue.syncLockfile({
      rootDir: options.cwd,
      manifest: config.manifest,
      currentLock: null,
      npmConfig: config.npmConfig,
    })
  }

  candidateLock = candidateLock.withManifest(config.manifest)

  for (const skillName of targetSkills) {
    const specifier = config.manifest.getSkillSpecifier(skillName)
    if (!specifier) {
      continue
    }

    try {
      const normalizedSpecifier = Specifier.parse(specifier)
      if (normalizedSpecifier.type === 'link') {
        result.skipped.push({ name: skillName, reason: 'link-specifier' })
        continue
      }

      const resolved = await resolveQueue.resolveSkill(
        options.cwd,
        config.manifest,
        skillName,
        specifier,
        config.npmConfig,
      )
      const previous = config.lockfile?.getEntry(skillName)
      if (
        previous &&
        stableStringify(previous.toJSON()) === stableStringify(resolved.entry.toJSON())
      ) {
        result.unchanged.push(skillName)
        continue
      }

      candidateLock = candidateLock.withEntry(resolved.skillName, resolved.entry)
      result.updated.push(skillName)
    } catch (error) {
      result.failed.push({ name: skillName, reason: (error as Error).message })
    }
  }

  if (result.failed.length > 0) {
    result.status = 'failed'
    return result
  }

  const runtimeLock = await resolveQueue.createRuntimeLockfile({
    rootDir: options.cwd,
    manifest: config.manifest,
    lockfile: candidateLock,
    npmConfig: config.npmConfig,
  })

  await runResolvedPipeline({
    rootDir: options.cwd,
    manifest: config.manifest,
    lockfile: runtimeLock,
    currentInstallState: config.installState,
    hooks: {
      beforeFetch: installStageHooks.beforeFetch,
    },
  })
  await new LockfileRepository().write(options.cwd, candidateLock)

  result.status = result.updated.length > 0 ? 'updated' : 'skipped'
  return result
}

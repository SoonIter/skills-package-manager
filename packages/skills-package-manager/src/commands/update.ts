import { attachManifestPatchToEntry, resolveLockEntry } from '../config/syncSkillsLock'
import type { SkillsLock, UpdateCommandOptions, UpdateCommandResult } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { withBundledSelfSkillLock } from '../install/withBundledSelfSkillLock'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
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

function createBaseLock(_cwd: string, currentLock: SkillsLock | null): SkillsLock {
  if (currentLock) {
    return {
      ...currentLock,
      skills: { ...currentLock.skills },
    }
  }

  return {
    lockfileVersion: '0.1',
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {},
  }
}

export async function updateCommand(options: UpdateCommandOptions): Promise<UpdateCommandResult> {
  const ctx = await loadConfig(options.cwd)

  if (!ctx.manifest.skills || Object.keys(ctx.manifest.skills).length === 0) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  const targetSkills = options.skills ?? Object.keys(ctx.manifest.skills)
  for (const skillName of targetSkills) {
    if (!(skillName in ctx.manifest.skills)) {
      throw new SkillError({
        code: ErrorCode.SKILL_NOT_FOUND,
        skillName,
        message: `Unknown skill: ${skillName}`,
      })
    }
  }

  const result = createEmptyResult()
  const candidateLock = createBaseLock(options.cwd, ctx.lockfile)
  candidateLock.installDir = ctx.manifest.installDir ?? '.agents/skills'
  candidateLock.linkTargets = ctx.manifest.linkTargets ?? []

  for (const skillName of targetSkills) {
    const specifier = ctx.manifest.skills[skillName]

    try {
      const normalized = normalizeSpecifier(specifier)
      if (normalized.type === 'link') {
        result.skipped.push({ name: skillName, reason: 'link-specifier' })
        continue
      }

      const { entry } = await resolveLockEntry(options.cwd, specifier)
      const nextEntry = await attachManifestPatchToEntry(
        options.cwd,
        ctx.manifest,
        skillName,
        entry,
      )
      const previous = ctx.lockfile?.skills[skillName]
      if (previous && stableStringify(previous) === stableStringify(nextEntry)) {
        result.unchanged.push(skillName)
        continue
      }

      candidateLock.skills[skillName] = nextEntry
      result.updated.push(skillName)
    } catch (error) {
      result.failed.push({ name: skillName, reason: (error as Error).message })
    }
  }

  if (result.failed.length > 0) {
    result.status = 'failed'
    return result
  }

  const runtimeLock = await withBundledSelfSkillLock(options.cwd, ctx.manifest, candidateLock)

  await runPipeline({
    ctx,
    entries: runtimeLock.skills,
    skipResolve: true,
  })

  await writeSkillsLock(options.cwd, candidateLock)

  result.status = result.updated.length > 0 ? 'updated' : 'skipped'
  return result
}

import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { expandSkillsManifest } from '../config/skillsManifest'
import { resolveLockEntry } from '../config/syncSkillsLock'
import type { SkillsLock, UpdateCommandOptions, UpdateCommandResult } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { fetchSkillsFromLock, linkSkillsFromLock } from '../install/installSkills'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'

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
  const manifest = await readSkillsManifest(options.cwd)
  if (!manifest) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }
  const effectiveManifest = await expandSkillsManifest(options.cwd, manifest)

  const currentLock = await readSkillsLock(options.cwd)
  const targetSkills = options.skills ?? Object.keys(effectiveManifest.skills)
  for (const skillName of targetSkills) {
    if (!(skillName in effectiveManifest.skills)) {
      throw new SkillError({
        code: ErrorCode.SKILL_NOT_FOUND,
        skillName,
        message: `Unknown skill: ${skillName}`,
      })
    }
  }

  const result = createEmptyResult()
  const candidateLock = createBaseLock(options.cwd, currentLock)
  candidateLock.installDir = effectiveManifest.installDir ?? '.agents/skills'
  candidateLock.linkTargets = effectiveManifest.linkTargets ?? []

  for (const skillName of targetSkills) {
    const specifier = effectiveManifest.skills[skillName]

    try {
      const normalized = normalizeSpecifier(specifier)
      if (normalized.type === 'link') {
        result.skipped.push({ name: skillName, reason: 'link-specifier' })
        continue
      }

      const { entry } = await resolveLockEntry(options.cwd, specifier)
      const previous = currentLock?.skills[skillName]
      if (
        previous?.resolution.type === 'git' &&
        entry.resolution.type === 'git' &&
        previous.specifier === entry.specifier &&
        previous.resolution.url === entry.resolution.url &&
        previous.resolution.commit === entry.resolution.commit &&
        previous.resolution.path === entry.resolution.path
      ) {
        result.unchanged.push(skillName)
        continue
      }

      if (
        previous?.resolution.type === 'npm' &&
        entry.resolution.type === 'npm' &&
        previous.specifier === entry.specifier &&
        previous.resolution.packageName === entry.resolution.packageName &&
        previous.resolution.version === entry.resolution.version &&
        previous.resolution.path === entry.resolution.path &&
        previous.resolution.tarball === entry.resolution.tarball &&
        previous.resolution.integrity === entry.resolution.integrity &&
        previous.resolution.registry === entry.resolution.registry
      ) {
        result.unchanged.push(skillName)
        continue
      }

      if (
        previous?.resolution.type === 'file' &&
        entry.resolution.type === 'file' &&
        previous.specifier === entry.specifier &&
        previous.digest === entry.digest
      ) {
        result.unchanged.push(skillName)
        continue
      }

      candidateLock.skills[skillName] = entry
      result.updated.push(skillName)
    } catch (error) {
      result.failed.push({ name: skillName, reason: (error as Error).message })
    }
  }

  if (result.failed.length > 0) {
    result.status = 'failed'
    return result
  }

  await fetchSkillsFromLock(options.cwd, effectiveManifest, candidateLock)
  await linkSkillsFromLock(options.cwd, effectiveManifest, candidateLock)
  await writeSkillsLock(options.cwd, candidateLock)

  result.status = result.updated.length > 0 ? 'updated' : 'skipped'
  return result
}

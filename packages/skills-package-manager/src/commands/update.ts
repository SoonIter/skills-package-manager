import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { resolveLockEntry } from '../config/syncSkillsLock'
import type { SkillsLock, UpdateCommandOptions, UpdateCommandResult } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { fetchSkillsFromLock, linkSkillsFromLock } from '../install/installSkills'

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
    return createEmptyResult()
  }

  const currentLock = await readSkillsLock(options.cwd)
  const targetSkills = options.skills ?? Object.keys(manifest.skills)
  for (const skillName of targetSkills) {
    if (!(skillName in manifest.skills)) {
      throw new Error(`Unknown skill: ${skillName}`)
    }
  }

  const result = createEmptyResult()
  const candidateLock = createBaseLock(options.cwd, currentLock)
  candidateLock.installDir = manifest.installDir ?? '.agents/skills'
  candidateLock.linkTargets = manifest.linkTargets ?? []

  for (const skillName of targetSkills) {
    const specifier = manifest.skills[skillName]

    if (specifier.startsWith('file:')) {
      result.skipped.push({ name: skillName, reason: 'file-specifier' })
      continue
    }

    try {
      const { entry } = await resolveLockEntry(options.cwd, specifier)
      const previous = currentLock?.skills[skillName]
      if (
        previous?.resolution.type === 'git' &&
        entry.resolution.type === 'git' &&
        previous.resolution.commit === entry.resolution.commit
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

  await fetchSkillsFromLock(options.cwd, manifest, candidateLock)
  await linkSkillsFromLock(options.cwd, manifest, candidateLock)
  await writeSkillsLock(options.cwd, candidateLock)

  result.status = result.updated.length > 0 ? 'updated' : 'skipped'
  return result
}

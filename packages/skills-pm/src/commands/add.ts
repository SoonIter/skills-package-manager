import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import type { AddCommandOptions } from '../config/types'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'

export async function addCommand(options: AddCommandOptions) {
  const normalized = normalizeSpecifier(options.specifier)
  const existingManifest = (await readSkillsManifest(options.cwd)) ?? {
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {},
  }

  const existing = existingManifest.skills[normalized.skillName]
  if (existing && existing !== normalized.normalized) {
    throw new Error(`Skill ${normalized.skillName} already exists with a different specifier`)
  }

  existingManifest.skills[normalized.skillName] = normalized.normalized
  await writeSkillsManifest(options.cwd, existingManifest)

  const existingLock = await readSkillsLock(options.cwd)
  const lockfile = await syncSkillsLock(options.cwd, existingManifest, existingLock)
  await writeSkillsLock(options.cwd, lockfile)

  return {
    skillName: normalized.skillName,
    specifier: normalized.normalized,
  }
}

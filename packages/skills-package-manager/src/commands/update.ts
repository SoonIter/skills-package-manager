import { readSkillsManifest } from '../config/readSkillsManifest'
import type { UpdateCommandOptions, UpdateCommandResult } from '../config/types'

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
  const manifest = await readSkillsManifest(options.cwd)
  if (!manifest) {
    return createEmptyResult()
  }

  const targetSkills = options.skills ?? Object.keys(manifest.skills)
  for (const skillName of targetSkills) {
    if (!(skillName in manifest.skills)) {
      throw new Error(`Unknown skill: ${skillName}`)
    }
  }

  return createEmptyResult()
}

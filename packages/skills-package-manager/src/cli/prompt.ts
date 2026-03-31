import * as p from '@clack/prompts'
import type { SkillInfo } from '../github/types'

export async function promptSkillSelection(skills: SkillInfo[]): Promise<SkillInfo[]> {
  if (skills.length === 0) {
    throw new Error('No skills found in repository')
  }

  // Single skill — auto-select
  if (skills.length === 1) {
    return skills
  }

  const options = skills.map((skill) => ({
    value: skill,
    label: skill.name,
    hint: skill.description
      ? skill.description.length > 60
        ? `${skill.description.slice(0, 57)}...`
        : skill.description
      : undefined,
  }))

  const selected = await p.multiselect({
    message: 'Select skills to install',
    options,
    required: true,
  })

  if (p.isCancel(selected)) {
    p.cancel('Installation cancelled')
    process.exit(0)
  }

  return selected as SkillInfo[]
}

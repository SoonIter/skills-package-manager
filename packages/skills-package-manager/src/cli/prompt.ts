import * as p from '@clack/prompts'
import type { SkillInfo } from '../github/types'

export const UNIVERSAL_AGENT_NAMES = [
  'Amp',
  'Antigravity',
  'Cline',
  'Codex',
  'Cursor',
  'Deep Agents',
  'Firebender',
  'Gemini CLI',
  'GitHub Copilot',
  'Kimi Code CLI',
  'OpenCode',
  'Warp',
] as const

export const ADDITIONAL_AGENT_TARGETS = [
  { label: 'Augment', path: '.augment/skills' },
  { label: 'IBM Bob', path: '.bob/skills' },
  { label: 'Claude Code', path: '.claude/skills' },
  { label: 'OpenClaw', path: 'skills' },
  { label: 'CodeBuddy', path: '.codebuddy/skills' },
  { label: 'Command Code', path: '.commandcode/skills' },
  { label: 'Continue', path: '.continue/skills' },
  { label: 'Cortex Code', path: '.cortex/skills' },
  { label: 'Trae', path: '.trae/skills' },
] as const

export type InitPromptResult = {
  installDir: string
  linkTargets: string[]
}

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

export async function promptInitManifestOptions(): Promise<InitPromptResult> {
  const installDirInput = await p.text({
    message: 'Where should skills be installed?',
    initialValue: '.agents/skills',
  })

  if (p.isCancel(installDirInput)) {
    p.cancel('Initialization cancelled')
    process.exit(0)
  }

  const configureAdditional = await p.confirm({
    message: 'Do you want to configure additional agent link targets?',
    initialValue: false,
  })

  if (p.isCancel(configureAdditional)) {
    p.cancel('Initialization cancelled')
    process.exit(0)
  }

  let linkTargets: string[] = []
  if (configureAdditional) {
    p.note(UNIVERSAL_AGENT_NAMES.join('\n'), 'Universal (.agents/skills) — always included')

    const selected = await p.groupMultiselect({
      message: 'Which agents do you want to install to?',
      options: {
        'Additional agents': ADDITIONAL_AGENT_TARGETS.map((agent) => ({
          value: agent.path,
          label: `${agent.label} (${agent.path})`,
        })),
      },
      required: false,
    })

    if (p.isCancel(selected)) {
      p.cancel('Initialization cancelled')
      process.exit(0)
    }

    linkTargets = selected as string[]
  }

  const installDir = String(installDirInput).trim() || '.agents/skills'
  return { installDir, linkTargets }
}

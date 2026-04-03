import { access } from 'node:fs/promises'
import path from 'node:path'
import type { InitPromptResult } from '../cli/prompt'
import { promptInitManifestOptions } from '../cli/prompt'
import type { InitCommandOptions, SkillsManifest } from '../config/types'
import { writeSkillsManifest } from '../config/writeSkillsManifest'

async function assertManifestMissing(cwd: string): Promise<void> {
  const filePath = path.join(cwd, 'skills.json')

  try {
    await access(filePath)
    throw new Error('skills.json already exists')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    throw error
  }
}

function createDefaultManifest(): SkillsManifest {
  return {
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {},
  }
}

export type InitPrompter = () => Promise<InitPromptResult>

export async function initCommand(
  options: InitCommandOptions,
  promptInit: InitPrompter = promptInitManifestOptions,
): Promise<SkillsManifest> {
  await assertManifestMissing(options.cwd)

  const manifest = options.yes
    ? createDefaultManifest()
    : {
        ...(await promptInit()),
        skills: {},
      }

  await writeSkillsManifest(options.cwd, manifest)

  return manifest
}

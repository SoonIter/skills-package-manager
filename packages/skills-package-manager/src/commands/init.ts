import { access } from 'node:fs/promises'
import path from 'node:path'
import type { InitPromptResult } from '../cli/prompt'
import { promptInitManifestOptions } from '../cli/prompt'
import type { InitCommandOptions, SkillsManifest } from '../config/types'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { ErrorCode, FileSystemError, ManifestError } from '../errors'

async function assertManifestMissing(cwd: string): Promise<void> {
  const filePath = path.join(cwd, 'skills.json')

  try {
    await access(filePath)
    throw new ManifestError({
      code: ErrorCode.MANIFEST_EXISTS,
      filePath,
      message: 'skills.json already exists',
    })
  } catch (error) {
    if (error instanceof ManifestError) {
      throw error
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    throw new FileSystemError({
      code: ErrorCode.FS_ERROR,
      operation: 'access',
      path: filePath,
      message: `Failed to check if manifest exists: ${(error as Error).message}`,
      cause: error as Error,
    })
  }
}

const DEFAULT_SCHEMA_URL = 'https://unpkg.com/skills-package-manager@latest/skills.schema.json'

function createDefaultManifest(): SkillsManifest {
  return {
    $schema: DEFAULT_SCHEMA_URL,
    installDir: '.agents/skills',
    linkTargets: [],
    selfSkill: false,
    skills: {},
  }
}

export type InitPrompter = () => Promise<InitPromptResult>

export async function initCommand(
  options: InitCommandOptions,
  promptInit: InitPrompter = promptInitManifestOptions,
): Promise<SkillsManifest> {
  await assertManifestMissing(options.cwd)

  const baseManifest = options.yes
    ? createDefaultManifest()
    : {
        $schema: DEFAULT_SCHEMA_URL,
        ...(await promptInit()),
        selfSkill: false,
        skills: {},
      }

  await writeSkillsManifest(options.cwd, baseManifest)

  return baseManifest
}

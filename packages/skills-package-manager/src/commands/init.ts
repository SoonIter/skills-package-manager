import { access } from 'node:fs/promises'
import path from 'node:path'
import { ErrorCode, FileSystemError, ManifestError } from '../errors'
import { promptInitManifestOptions } from '../cli/prompt'
import type { InitPromptResult } from '../cli/prompt'
import type { InitCommandOptions, SkillsManifest } from '../config/types'
import { writeSkillsManifest } from '../config/writeSkillsManifest'

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

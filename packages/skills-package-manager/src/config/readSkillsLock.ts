import { readFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import { ErrorCode, ParseError } from '../errors'
import { convertNodeError } from '../errors'
import type { SkillsLock } from './types'

export async function readSkillsLock(rootDir: string): Promise<SkillsLock | null> {
  const filePath = path.join(rootDir, 'skills-lock.yaml')

  try {
    const raw = await readFile(filePath, 'utf8')
    try {
      return YAML.parse(raw) as SkillsLock
    } catch (parseError) {
      throw new ParseError({
        code: ErrorCode.YAML_PARSE_ERROR,
        filePath,
        content: raw,
        message: `Failed to parse skills-lock.yaml: ${(parseError as Error).message}`,
        cause: parseError as Error,
      })
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    if (error instanceof ParseError) {
      throw error
    }
    throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'read', path: filePath })
  }
}

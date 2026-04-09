import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { convertNodeError, ErrorCode, ParseError } from '../errors'
import { normalizeSkillsManifest } from './skillsManifest'
import type { SkillsManifest } from './types'

export async function readSkillsManifest(rootDir: string): Promise<SkillsManifest | null> {
  const filePath = path.join(rootDir, 'skills.json')

  try {
    const raw = await readFile(filePath, 'utf8')
    try {
      const json = JSON.parse(raw) as Partial<SkillsManifest>
      return normalizeSkillsManifest(json)
    } catch (parseError) {
      throw new ParseError({
        code: ErrorCode.JSON_PARSE_ERROR,
        filePath,
        content: raw,
        message: `Failed to parse skills.json: ${(parseError as Error).message}`,
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

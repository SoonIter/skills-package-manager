import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { convertNodeError, ErrorCode, ManifestError, ParseError } from '../errors'
import { skillsManifestSchema } from './schema'
import type { SkillsManifest } from './types'

export async function readSkillsManifest(rootDir: string): Promise<SkillsManifest | null> {
  const filePath = path.join(rootDir, 'skills.json')

  try {
    const raw = await readFile(filePath, 'utf8')
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw)
    } catch (parseError) {
      throw new ParseError({
        code: ErrorCode.JSON_PARSE_ERROR,
        filePath,
        content: raw,
        message: `Failed to parse skills.json: ${(parseError as Error).message}`,
        cause: parseError as Error,
      })
    }

    // Validate using Zod schema
    const result = skillsManifestSchema.safeParse(parsedJson)
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => {
          const pathStr = issue.path.length > 0 ? issue.path.join('.') : '(root)'
          return `${pathStr}: ${issue.message}`
        })
        .join('\n  - ')
      throw new ManifestError({
        code: ErrorCode.MANIFEST_VALIDATION_ERROR,
        filePath,
        message: `Invalid skills.json:\n  - ${issues}`,
      })
    }

    return result.data
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    if (error instanceof ParseError || error instanceof ManifestError) {
      throw error
    }
    throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'read', path: filePath })
  }
}

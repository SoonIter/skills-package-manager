import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pkg from '../../package.json'
import { skillsManifestSchema } from '../config/schema'
import { convertNodeError, ErrorCode, ManifestError, ParseError } from '../errors'
import { Manifest } from '../structures/Manifest'

const DEFAULT_SCHEMA_URL = `https://unpkg.com/skills-package-manager@${pkg.version}/skills.schema.json`

export class ManifestRepository {
  async read(rootDir: string): Promise<Manifest | null> {
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

      return Manifest.from(result.data)
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

  async write(rootDir: string, manifest: Manifest): Promise<void> {
    const filePath = path.join(rootDir, 'skills.json')

    try {
      await writeFile(
        filePath,
        `${JSON.stringify(manifest.toJSON({ includeDefaults: true, defaultSchemaUrl: DEFAULT_SCHEMA_URL }), null, 2)}\n`,
        'utf8',
      )
    } catch (error) {
      throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'write', path: filePath })
    }
  }
}

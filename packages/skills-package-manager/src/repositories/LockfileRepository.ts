import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import { convertNodeError, ErrorCode, ParseError } from '../errors'
import { Lockfile } from '../structures/Lockfile'

export class LockfileRepository {
  async read(rootDir: string): Promise<Lockfile | null> {
    const filePath = path.join(rootDir, 'skills-lock.yaml')

    try {
      const raw = await readFile(filePath, 'utf8')
      try {
        return Lockfile.from(YAML.parse(raw))
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

  async write(rootDir: string, lockfile: Lockfile): Promise<void> {
    const filePath = path.join(rootDir, 'skills-lock.yaml')

    try {
      await writeFile(filePath, YAML.stringify(lockfile.toYAMLObject()), 'utf8')
    } catch (error) {
      throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'write', path: filePath })
    }
  }
}

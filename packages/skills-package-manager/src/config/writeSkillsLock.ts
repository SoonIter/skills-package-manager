import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import { convertNodeError } from '../errors'
import type { SkillsLock } from './types'

export async function writeSkillsLock(rootDir: string, lockfile: SkillsLock): Promise<void> {
  const filePath = path.join(rootDir, 'skills-lock.yaml')
  try {
    await writeFile(filePath, YAML.stringify(lockfile), 'utf8')
  } catch (error) {
    throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'write', path: filePath })
  }
}

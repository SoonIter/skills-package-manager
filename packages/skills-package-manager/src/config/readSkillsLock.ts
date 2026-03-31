import { readFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import type { SkillsLock } from './types'

export async function readSkillsLock(rootDir: string): Promise<SkillsLock | null> {
  const filePath = path.join(rootDir, 'skills-lock.yaml')

  try {
    const raw = await readFile(filePath, 'utf8')
    return YAML.parse(raw) as SkillsLock
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

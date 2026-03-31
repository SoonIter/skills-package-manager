import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import type { SkillsLock } from './types'

export async function writeSkillsLock(rootDir: string, lockfile: SkillsLock): Promise<void> {
  const filePath = path.join(rootDir, 'skills-lock.yaml')
  await writeFile(filePath, YAML.stringify(lockfile), 'utf8')
}

import { access } from 'node:fs/promises'
import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'

export async function fetchLocalSkill(rootDir: string, entry: SkillsLockEntry): Promise<string> {
  if (entry.resolution.type !== 'local') {
    throw new Error('Expected local resolution')
  }

  const sourceRoot = path.resolve(rootDir, entry.resolution.path)
  try {
    await access(path.join(sourceRoot, 'SKILL.md'))
  } catch {
    throw new Error(`Invalid local skill at ${sourceRoot}: missing SKILL.md`)
  }

  return sourceRoot
}

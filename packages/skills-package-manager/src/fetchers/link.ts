import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'
import { materializeLocalSkill } from '../install/materializeLocalSkill'

export async function fetchLinkSkill(
  rootDir: string,
  skillName: string,
  entry: SkillsLockEntry,
  installDir: string,
): Promise<string> {
  if (entry.resolution.type !== 'link') {
    throw new Error('Expected link resolution')
  }

  const sourceRoot = path.resolve(rootDir, entry.resolution.path)
  await materializeLocalSkill(rootDir, skillName, sourceRoot, '/', installDir)
  return path.join(rootDir, installDir, skillName)
}

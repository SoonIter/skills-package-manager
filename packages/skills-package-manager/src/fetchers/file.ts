import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'
import { materializePackedSkill } from '../install/materializePackedSkill'

export async function fetchFileSkill(
  rootDir: string,
  skillName: string,
  entry: SkillsLockEntry,
  installDir: string,
): Promise<string> {
  if (entry.resolution.type !== 'file') {
    throw new Error('Expected file resolution')
  }

  const tarballPath = path.resolve(rootDir, entry.resolution.tarball)
  await materializePackedSkill(rootDir, skillName, tarballPath, entry.resolution.path, installDir)
  return path.join(rootDir, installDir, skillName)
}

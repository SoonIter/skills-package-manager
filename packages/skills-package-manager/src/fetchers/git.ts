import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'
import { extractGitSkillToDir, materializeGitSkill } from '../install/materializeGitSkill'

export async function fetchGitSkill(
  rootDir: string,
  skillName: string,
  entry: SkillsLockEntry,
  installDir: string,
): Promise<string> {
  if (entry.resolution.type !== 'git') {
    throw new Error('Expected git resolution')
  }

  const targetDir = path.join(rootDir, installDir, skillName)
  await materializeGitSkill(
    rootDir,
    skillName,
    entry.resolution.url,
    entry.resolution.commit,
    entry.resolution.path,
    installDir,
    entry.digest,
  )
  return targetDir
}

export async function extractGitSkillToPath(
  entry: SkillsLockEntry,
  targetDir: string,
): Promise<void> {
  if (entry.resolution.type !== 'git') {
    throw new Error('Expected git resolution')
  }

  await extractGitSkillToDir(
    entry.resolution.url,
    entry.resolution.commit,
    entry.resolution.path,
    targetDir,
  )
}

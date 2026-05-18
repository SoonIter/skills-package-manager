import { rm, symlink } from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedSkillEntry } from '../config/types'
import { ensureDir } from '../utils/fs'

export async function fetchLinkSkill(
  rootDir: string,
  skillName: string,
  entry: ResolvedSkillEntry,
  installDir: string,
): Promise<string> {
  if (entry.resolution.type !== 'link') {
    throw new Error('Expected link resolution')
  }

  const sourceRoot = path.resolve(rootDir, entry.resolution.path)
  const targetDir = path.join(rootDir, installDir, skillName)

  await ensureDir(path.dirname(targetDir))
  await rm(targetDir, { recursive: true, force: true }).catch(() => {})
  await symlink(sourceRoot, targetDir)

  return targetDir
}

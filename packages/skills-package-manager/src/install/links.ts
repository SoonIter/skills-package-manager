import path from 'node:path'
import { ensureDir, replaceSymlink } from '../utils/fs'

function resolveTargetPath(rootDir: string, targetPath: string): string {
  return path.isAbsolute(targetPath) ? targetPath : path.join(rootDir, targetPath)
}

export async function linkSkill(
  rootDir: string,
  installDir: string,
  linkTarget: string,
  skillName: string,
) {
  const absoluteTarget = path.join(rootDir, installDir, skillName)
  const absoluteLink = path.join(resolveTargetPath(rootDir, linkTarget), skillName)
  await ensureDir(path.dirname(absoluteLink))
  await replaceSymlink(absoluteTarget, absoluteLink)
}

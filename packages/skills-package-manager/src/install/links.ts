import path from 'node:path'
import { ensureDir, replaceSymlink } from '../utils/fs'

export async function linkSkill(
  rootDir: string,
  installDir: string,
  linkTarget: string,
  skillName: string,
) {
  const absoluteTarget = path.join(rootDir, installDir, skillName)
  const absoluteLink = path.join(rootDir, linkTarget, skillName)
  await ensureDir(path.dirname(absoluteLink))
  await replaceSymlink(absoluteTarget, absoluteLink)
}

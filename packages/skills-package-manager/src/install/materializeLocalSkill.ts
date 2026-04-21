import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, replaceDir, writeJson } from '../utils/fs'

export async function copyLocalSkillToDir(
  sourceRoot: string,
  sourcePath: string,
  targetDir: string,
) {
  const relativeSkillPath = sourcePath.replace(/^\//, '')
  const absoluteSkillPath = path.join(sourceRoot, relativeSkillPath)
  const skillDocPath = path.join(absoluteSkillPath, 'SKILL.md')

  let skillDoc = ''
  try {
    skillDoc = await readFile(skillDocPath, 'utf8')
  } catch {
    throw new Error(`Invalid skill at ${absoluteSkillPath}: missing SKILL.md`)
  }

  if (!skillDoc) {
    throw new Error(`Invalid skill at ${absoluteSkillPath}: missing SKILL.md`)
  }

  await ensureDir(path.dirname(targetDir))
  await replaceDir(absoluteSkillPath, targetDir)
}

export async function writeInstalledSkillMarker(
  targetDir: string,
  skillName: string,
  digest?: string,
) {
  await writeJson(path.join(targetDir, '.skills-pm.json'), {
    name: skillName,
    installedBy: 'skills-package-manager',
    version: '0.1.0',
    digest,
  })
}

export async function materializeLocalSkill(
  rootDir: string,
  skillName: string,
  sourceRoot: string,
  sourcePath: string,
  installDir: string,
) {
  const targetDir = path.join(rootDir, installDir, skillName)
  await copyLocalSkillToDir(sourceRoot, sourcePath, targetDir)
  await writeInstalledSkillMarker(targetDir, skillName)
}

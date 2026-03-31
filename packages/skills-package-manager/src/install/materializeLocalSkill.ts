import { cp, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, writeJson } from '../utils/fs'

export async function materializeLocalSkill(
  rootDir: string,
  skillName: string,
  sourceRoot: string,
  sourcePath: string,
  installDir: string,
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

  const targetDir = path.join(rootDir, installDir, skillName)
  await ensureDir(path.dirname(targetDir))
  await cp(absoluteSkillPath, targetDir, { recursive: true, force: true })
  await writeJson(path.join(targetDir, '.skills-pm.json'), {
    name: skillName,
    installedBy: 'skills-package-manager',
    version: '0.1.0',
  })
}

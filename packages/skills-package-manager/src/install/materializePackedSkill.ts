import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { x } from 'tar'
import { copyLocalSkillToDir, writeInstalledSkillMarker } from './materializeLocalSkill'

export async function extractPackedSkillToDir(
  tarballPath: string,
  sourcePath: string,
  targetDir: string,
) {
  const extractRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-packed-skill-'))

  try {
    await mkdir(path.join(extractRoot, 'package'), { recursive: true })
    await x({
      file: tarballPath,
      cwd: path.join(extractRoot, 'package'),
      strip: 1,
      preservePaths: false,
      strict: true,
    })
    await copyLocalSkillToDir(path.join(extractRoot, 'package'), sourcePath, targetDir)
  } finally {
    await rm(extractRoot, { recursive: true, force: true }).catch(() => {})
  }
}

export async function materializePackedSkill(
  rootDir: string,
  skillName: string,
  tarballPath: string,
  sourcePath: string,
  installDir: string,
) {
  const targetDir = path.join(rootDir, installDir, skillName)
  await extractPackedSkillToDir(tarballPath, sourcePath, targetDir)
  await writeInstalledSkillMarker(targetDir, skillName)
}

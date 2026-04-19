import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'
import { cleanupPackedNpmPackage, downloadNpmPackageTarball } from '../npm/packPackage'
import { extractGitSkillToDir } from './materializeGitSkill'
import { copyLocalSkillToDir } from './materializeLocalSkill'
import { extractPackedSkillToDir } from './materializePackedSkill'

export async function extractSkillToDir(
  rootDir: string,
  entry: SkillsLockEntry,
  targetDir: string,
) {
  if (entry.resolution.type === 'link') {
    await copyLocalSkillToDir(path.resolve(rootDir, entry.resolution.path), '/', targetDir)
    return
  }

  if (entry.resolution.type === 'file') {
    await extractPackedSkillToDir(
      path.resolve(rootDir, entry.resolution.tarball),
      entry.resolution.path,
      targetDir,
    )
    return
  }

  if (entry.resolution.type === 'git') {
    await extractGitSkillToDir(
      entry.resolution.url,
      entry.resolution.commit,
      entry.resolution.path,
      targetDir,
    )
    return
  }

  if (entry.resolution.type === 'npm') {
    const tarballPath = await downloadNpmPackageTarball(
      rootDir,
      entry.resolution.tarball,
      entry.resolution.integrity,
    )

    try {
      await extractPackedSkillToDir(tarballPath, entry.resolution.path, targetDir)
    } finally {
      await cleanupPackedNpmPackage(tarballPath)
    }
    return
  }

  throw new Error(`Unsupported resolution type in 0.1.0 core flow: ${entry.resolution.type}`)
}

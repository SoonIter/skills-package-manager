import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'
import { materializePackedSkill } from '../install/materializePackedSkill'
import { downloadNpmPackageTarball } from '../npm/packPackage'
import type { CacheManager } from '../pipeline/types'

export async function fetchNpmSkill(
  rootDir: string,
  skillName: string,
  entry: SkillsLockEntry,
  installDir: string,
  cache: CacheManager,
): Promise<string> {
  if (entry.resolution.type !== 'npm') {
    throw new Error('Expected npm resolution')
  }

  const resolution = entry.resolution
  if (resolution.type !== 'npm') {
    throw new Error('Expected npm resolution')
  }
  const cacheKey = `${resolution.tarball}\0${resolution.integrity ?? ''}`
  const tarballPath = await cache.getOrSet(cacheKey, () =>
    downloadNpmPackageTarball(rootDir, resolution.tarball, resolution.integrity),
  )

  await materializePackedSkill(rootDir, skillName, tarballPath, entry.resolution.path, installDir)

  return path.join(rootDir, installDir, skillName)
}

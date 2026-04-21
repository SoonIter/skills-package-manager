import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'
import { materializePackedSkill } from '../install/materializePackedSkill'
import { downloadNpmPackageTarball } from '../npm/packPackage'
import type { CacheManager } from '../pipeline/types'

// In-flight deduplication for concurrent npm fetches (memory-level, faster than filesystem cache)
const inFlightDownloads = new Map<string, Promise<{ tarballPath: string; fromCache: boolean }>>()

export async function fetchNpmSkill(
  rootDir: string,
  skillName: string,
  entry: SkillsLockEntry,
  installDir: string,
  _cache: CacheManager,
): Promise<{ installPath: string; fromCache: boolean }> {
  if (entry.resolution.type !== 'npm') {
    throw new Error('Expected npm resolution')
  }

  const resolution = entry.resolution
  const cacheKey = `${resolution.tarball}\0${resolution.integrity ?? ''}`

  // 1. Check memory in-flight first (atomic dedup for concurrent requests)
  let inFlight = inFlightDownloads.get(cacheKey)
  if (inFlight) {
    const { tarballPath, fromCache } = await inFlight
    try {
      await materializePackedSkill(
        rootDir,
        skillName,
        tarballPath,
        resolution.path,
        installDir,
        entry.digest,
      )
      return { installPath: path.join(rootDir, installDir, skillName), fromCache }
    } finally {
      // cleanup is handled by the original downloader
    }
  }

  // 2. Start download and register in-flight
  inFlight = downloadNpmPackageTarball(rootDir, resolution.tarball, resolution.integrity)
  inFlightDownloads.set(cacheKey, inFlight)

  try {
    const { tarballPath, fromCache } = await inFlight
    await materializePackedSkill(
      rootDir,
      skillName,
      tarballPath,
      resolution.path,
      installDir,
      entry.digest,
    )
    return { installPath: path.join(rootDir, installDir, skillName), fromCache }
  } finally {
    inFlightDownloads.delete(cacheKey)
    // Note: cleanupPackedNpmPackage is not called here because tarballs are stored
    // in a persistent cache directory (see downloadNpmPackageTarball). The old
    // installSkills flow cleaned up temp directories at the end of fetchSkillsFromLock,
    // but the current implementation uses a deterministic persistent cache, so no
    // per-run cleanup is required.
  }
}

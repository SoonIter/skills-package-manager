import type { SkillsLockEntry } from '../config/types'
import type { CacheManager } from '../pipeline/types'
import { fetchFileSkill } from './file'
import { fetchGitSkill } from './git'
import { fetchLinkSkill } from './link'
import { fetchNpmSkill } from './npm'

export async function fetchSkill(
  rootDir: string,
  skillName: string,
  entry: SkillsLockEntry,
  installDir: string,
  cache: CacheManager,
): Promise<{ installPath: string; fromCache?: boolean }> {
  switch (entry.resolution.type) {
    case 'link':
      return { installPath: await fetchLinkSkill(rootDir, skillName, entry, installDir) }
    case 'file':
      return { installPath: await fetchFileSkill(rootDir, skillName, entry, installDir) }
    case 'git':
      return { installPath: await fetchGitSkill(rootDir, skillName, entry, installDir) }
    case 'npm':
      return fetchNpmSkill(rootDir, skillName, entry, installDir, cache)
    default: {
      const _exhaustive: never = entry.resolution
      throw new Error(`Unsupported resolution type: ${_exhaustive}`)
    }
  }
}

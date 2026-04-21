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
): Promise<string> {
  switch (entry.resolution.type) {
    case 'link':
      return fetchLinkSkill(rootDir, skillName, entry, installDir)
    case 'file':
      return fetchFileSkill(rootDir, skillName, entry, installDir)
    case 'git':
      return fetchGitSkill(rootDir, skillName, entry, installDir)
    case 'npm':
      return fetchNpmSkill(rootDir, skillName, entry, installDir, cache)
    default: {
      const _exhaustive: never = entry.resolution
      throw new Error(`Unsupported resolution type: ${_exhaustive}`)
    }
  }
}

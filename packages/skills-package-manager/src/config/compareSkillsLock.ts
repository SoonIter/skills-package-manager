import type { SkillsLock, SkillsManifest } from './types'

/**
 * Check if lockfile is in sync with manifest
 * Only compares skill list and specifiers, does not resolve git refs
 */
export function isLockInSync(manifest: SkillsManifest, lock: SkillsLock | null): boolean {
  if (!lock) return false

  const manifestSkills = Object.entries(manifest.skills)
  const lockSkillNames = Object.keys(lock.skills)

  // Check skill count
  if (manifestSkills.length !== lockSkillNames.length) {
    return false
  }

  // Check each skill's specifier matches
  for (const [name, specifier] of manifestSkills) {
    const lockEntry = lock.skills[name]
    if (!lockEntry) return false
    if (lockEntry.specifier !== specifier) return false
  }

  return true
}

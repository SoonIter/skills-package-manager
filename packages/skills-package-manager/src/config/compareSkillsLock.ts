import type { SkillsLock, SkillsManifest } from './types'
import { parseSpecifier } from '../specifiers/parseSpecifier'

interface ParsedSpecifier {
  sourcePart: string
  ref: string | null
  path: string
}

function parseForComparison(specifier: string): ParsedSpecifier {
  const parsed = parseSpecifier(specifier)
  return {
    sourcePart: parsed.sourcePart,
    ref: parsed.ref,
    path: parsed.path || '/',
  }
}

/**
 * Check if manifest specifier is compatible with lock specifier
 * Manifest without ref is compatible with any lock ref (use lock version)
 */
function isSpecifierCompatible(manifestSpecifier: string, lockSpecifier: string): boolean {
  const manifest = parseForComparison(manifestSpecifier)
  const lock = parseForComparison(lockSpecifier)

  // Source must match
  if (manifest.sourcePart !== lock.sourcePart) {
    return false
  }

  // Path must match
  if (manifest.path !== lock.path) {
    return false
  }

  // Manifest has no ref -> compatible with any lock ref
  if (manifest.ref === null) {
    return true
  }

  // Manifest has ref -> must match lock exactly
  return manifest.ref === lock.ref
}

/**
 * Check if lockfile is in sync with manifest
 * Uses semantic comparison of specifiers (not strict string equality)
 */
export function isLockInSync(manifest: SkillsManifest, lock: SkillsLock | null): boolean {
  if (!lock) return false

  const manifestSkills = Object.entries(manifest.skills)
  const lockSkillNames = Object.keys(lock.skills)

  // Check skill count
  if (manifestSkills.length !== lockSkillNames.length) {
    return false
  }

  // Check each skill's specifier is compatible
  for (const [name, specifier] of manifestSkills) {
    const lockEntry = lock.skills[name]
    if (!lockEntry) return false
    if (!isSpecifierCompatible(specifier, lockEntry.specifier)) return false
  }

  return true
}

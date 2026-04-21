import type { NormalizedSpecifier, SkillsLockEntry } from '../config/types'
import { resolveFileEntry } from './file'
import { resolveGitEntry } from './git'
import { resolveLinkEntry } from './link'
import { resolveNpmEntry } from './npm'

export async function resolveEntry(
  cwd: string,
  normalized: NormalizedSpecifier,
  skillName?: string,
): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const finalSkillName = skillName || normalized.skillName

  switch (normalized.type) {
    case 'link':
      return resolveLinkEntry(cwd, normalized.source, finalSkillName, normalized.normalized)
    case 'file':
      return resolveFileEntry(
        cwd,
        normalized.source,
        normalized.path,
        finalSkillName,
        normalized.normalized,
      )
    case 'git':
      return resolveGitEntry(
        normalized.source,
        normalized.ref,
        normalized.path,
        finalSkillName,
        normalized.normalized,
      )
    case 'npm':
      return resolveNpmEntry(
        cwd,
        normalized.source,
        normalized.path,
        finalSkillName,
        normalized.normalized,
      )
    default: {
      const _exhaustive: never = normalized.type
      throw new Error(`Unsupported specifier type: ${_exhaustive}`)
    }
  }
}

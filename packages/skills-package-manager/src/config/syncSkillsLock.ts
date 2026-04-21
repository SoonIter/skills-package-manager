import path from 'node:path'
import type { NormalizedSpecifier } from '../config/types'
import { ErrorCode, ParseError } from '../errors'
import { resolveEntry } from '../resolvers'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { sha256File } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'
import { isLockInSync } from './compareSkillsLock'
import type {
  InstallProgressListener,
  NormalizedSkillsManifest,
  SkillsLock,
  SkillsLockEntry,
} from './types'

export async function resolveLockEntry(
  cwd: string,
  specifier: string,
  skillName?: string,
): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  let normalized: NormalizedSpecifier
  try {
    normalized = normalizeSpecifier(specifier)
  } catch (error) {
    if (error instanceof ParseError) {
      throw error
    }
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: `Failed to parse specifier "${specifier}": ${(error as Error).message}`,
      content: specifier,
      cause: error as Error,
    })
  }

  return resolveEntry(cwd, normalized, skillName)
}

export async function attachManifestPatchToEntry(
  cwd: string,
  manifest: NormalizedSkillsManifest,
  skillName: string,
  entry: SkillsLockEntry,
): Promise<SkillsLockEntry> {
  const patchPath = manifest.patchedSkills?.[skillName]
  if (!patchPath) {
    return entry
  }

  const absolutePatchPath = path.resolve(cwd, patchPath)
  return {
    ...entry,
    patch: {
      path: toPortableRelativePath(cwd, absolutePatchPath),
      digest: await sha256File(absolutePatchPath),
    },
  }
}

export async function syncSkillsLock(
  cwd: string,
  manifest: NormalizedSkillsManifest,
  existingLock: SkillsLock | null,
  options?: {
    onProgress?: InstallProgressListener
  },
): Promise<SkillsLock> {
  // Fast path: if existingLock is in sync with manifest, reuse npm/git entries
  // and only re-resolve link/file entries to detect local source changes.
  const reuseEntries = new Map<string, SkillsLockEntry>()
  if (existingLock && (await isLockInSync(cwd, manifest, existingLock))) {
    for (const [name, entry] of Object.entries(existingLock.skills)) {
      if (entry.resolution.type === 'npm' || entry.resolution.type === 'git') {
        reuseEntries.set(name, entry)
      }
    }
  }

  const entries = await Promise.all(
    Object.entries(manifest.skills).map(async ([skillName, specifier]) => {
      const reused = reuseEntries.get(skillName)
      if (reused) {
        const entryWithPatch = await attachManifestPatchToEntry(cwd, manifest, skillName, reused)
        options?.onProgress?.({ type: 'resolved', skillName })
        return [skillName, entryWithPatch] as const
      }

      const { skillName: resolvedName, entry } = await resolveLockEntry(cwd, specifier, skillName)
      const entryWithPatch = await attachManifestPatchToEntry(cwd, manifest, resolvedName, entry)
      options?.onProgress?.({ type: 'resolved', skillName: resolvedName })
      return [resolvedName, entryWithPatch] as const
    }),
  )

  const nextSkills: Record<string, SkillsLockEntry> = Object.fromEntries(entries)

  return {
    lockfileVersion: '0.1',
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    skills: nextSkills,
  }
}

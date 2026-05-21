import path from 'node:path'
import { ErrorCode, ParseError } from '../errors'
import type { ManifestStat } from '../pipeline/types'
import { resolveEntry } from '../resolvers'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { sha256File } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'
import { expandSkillsManifest } from './skillsManifest'
import type {
  InstallProgressListener,
  NormalizedSkillsManifest,
  NormalizedSpecifier,
  ResolvedSkillEntry,
  ResolvedSkillsPlan,
} from './types'

export async function resolveSkillEntry(
  cwd: string,
  specifier: string,
  skillName?: string,
  options?: { installDir?: string },
): Promise<{ skillName: string; entry: ResolvedSkillEntry }> {
  let normalized: NormalizedSpecifier
  try {
    normalized = normalizeSpecifier(specifier, {
      installDir: options?.installDir,
      skillName,
    })
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
  entry: ResolvedSkillEntry,
): Promise<ResolvedSkillEntry> {
  const patchPath = manifest.patchedSkills?.[skillName]
  if (!patchPath) {
    return entry
  }

  if (entry.resolution.type === 'local') {
    throw new Error(`local: skill ${skillName} cannot be patched because its source is user-owned`)
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

export async function resolveSkillsPlan(
  cwd: string,
  manifest: NormalizedSkillsManifest,
  options?: {
    onProgress?: InstallProgressListener
    manifestStat?: ManifestStat | null
    installState?: { manifestStat?: ManifestStat } | null
  },
): Promise<ResolvedSkillsPlan> {
  const expandedManifest = await expandSkillsManifest(cwd, manifest)
  const entries = await Promise.all(
    Object.entries(expandedManifest.skills).map(async ([skillName, specifier]) => {
      const { skillName: resolvedName, entry } = await resolveSkillEntry(
        cwd,
        specifier,
        skillName,
        {
          installDir: expandedManifest.installDir,
        },
      )
      const entryWithPatch = await attachManifestPatchToEntry(
        cwd,
        expandedManifest,
        resolvedName,
        entry,
      )
      options?.onProgress?.({ type: 'resolved', skillName: resolvedName })
      return [resolvedName, entryWithPatch] as const
    }),
  )

  return {
    installDir: expandedManifest.installDir,
    linkTargets: expandedManifest.linkTargets,
    skills: Object.fromEntries(entries),
  }
}

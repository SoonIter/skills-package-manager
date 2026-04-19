import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { NormalizedSpecifier } from '../config/types'
import { ErrorCode, GitError, ParseError } from '../errors'
import { resolveNpmPackage } from '../npm/packPackage'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { sha256, sha256Directory, sha256File } from '../utils/hash'
import type { InstallProgressListener, SkillsLock, SkillsLockEntry, SkillsManifest } from './types'

const execFileAsync = promisify(execFile)

function toPortableRelativePath(from: string, to: string): string {
  const relativePath = path.relative(from, to) || '.'
  return path.sep === '/' ? relativePath : relativePath.split(path.sep).join('/')
}

async function resolveGitCommitByLsRemote(url: string, target: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-remote', url, target, `${target}^{}`])
    const lines = stdout
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const peeledLine = lines.find((line) => line.endsWith('^{}'))
    const resolvedLine = peeledLine ?? lines[0]
    return resolvedLine?.split('\t')[0]?.trim() || null
  } catch {
    return null
  }
}

async function resolveGitCommitByClone(url: string, target: string): Promise<string | null> {
  const checkoutRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-git-ref-'))

  try {
    await execFileAsync('git', ['clone', '--bare', '--quiet', url, checkoutRoot])
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', `${target}^{commit}`], {
      cwd: checkoutRoot,
    })
    return stdout.trim().split('\n')[0]?.trim() || null
  } catch {
    return null
  } finally {
    await rm(checkoutRoot, { recursive: true, force: true }).catch(() => {})
  }
}

async function resolveGitCommit(url: string, ref: string | null): Promise<string> {
  const target = ref ?? 'HEAD'
  const commit = await resolveGitCommitByLsRemote(url, target)

  if (commit) {
    return commit
  }

  const clonedCommit = await resolveGitCommitByClone(url, target)

  if (clonedCommit) {
    return clonedCommit
  }

  throw new GitError({
    code: ErrorCode.GIT_REF_NOT_FOUND,
    operation: 'resolve-ref',
    repoUrl: url,
    ref: target,
    message: `Unable to resolve git ref "${target}" for ${url}`,
  })
}

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

  // Use provided skillName from manifest key, fallback to parsed skillName
  const finalSkillName = skillName || normalized.skillName

  if (normalized.type === 'link') {
    const sourceRoot = path.resolve(cwd, normalized.source.slice('link:'.length))
    return {
      skillName: finalSkillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'link',
          path: toPortableRelativePath(cwd, sourceRoot),
        },
        digest: await sha256Directory(sourceRoot),
      },
    }
  }

  if (normalized.type === 'file') {
    const tarballPath = path.resolve(cwd, normalized.source.slice('file:'.length))
    return {
      skillName: finalSkillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'file',
          tarball: toPortableRelativePath(cwd, tarballPath),
          path: normalized.path,
        },
        digest: await sha256File(tarballPath, `:${normalized.path}`),
      },
    }
  }

  if (normalized.type === 'git') {
    const commit = await resolveGitCommit(normalized.source, normalized.ref)
    return {
      skillName: finalSkillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'git',
          url: normalized.source,
          commit,
          path: normalized.path,
        },
        digest: sha256(`${normalized.source}:${commit}:${normalized.path}`),
      },
    }
  }

  if (normalized.type === 'npm') {
    const packageSpecifier = normalized.source.slice('npm:'.length)
    const resolved = await resolveNpmPackage(cwd, packageSpecifier)

    return {
      skillName: finalSkillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'npm',
          packageName: resolved.name,
          version: resolved.version,
          path: normalized.path,
          tarball: resolved.tarballUrl,
          integrity: resolved.integrity,
          registry: resolved.registry,
        },
        digest: sha256(
          [
            resolved.name,
            resolved.version,
            resolved.tarballUrl,
            resolved.integrity ?? '',
            resolved.registry ?? '',
            normalized.path,
          ].join(':'),
        ),
      },
    }
  }

  throw new ParseError({
    code: ErrorCode.INVALID_SPECIFIER,
    message: `Unsupported specifier type in 0.1.0 core flow: ${normalized.type}`,
    content: specifier,
  })
}

export async function attachManifestPatchToEntry(
  cwd: string,
  manifest: SkillsManifest,
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
  manifest: SkillsManifest,
  _existingLock: SkillsLock | null,
  options?: {
    onProgress?: InstallProgressListener
  },
): Promise<SkillsLock> {
  const entries = await Promise.all(
    Object.entries(manifest.skills).map(async ([skillName, specifier]) => {
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

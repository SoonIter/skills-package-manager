import type { NormalizedSpecifier, ResolvedSkillEntry } from '../config/types'
import { resolveNpmPackage } from '../npm/packPackage'
import { resolveGitCommit } from '../resolvers/git'

export function formatPathSuffix(skillPath: string): string {
  return skillPath === '/' ? '' : `&path:${skillPath}`
}

export function toGitHubSpecifierSource(repoUrl: string): string {
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (!match) {
    return repoUrl
  }

  const [, owner, repo] = match
  return `github:${owner}/${repo.replace(/\.git$/, '')}`
}

export function formatResolvedManifestSpecifier(
  normalized: NormalizedSpecifier,
  entry: ResolvedSkillEntry,
  originalSpecifier: string,
): string {
  if (originalSpecifier === 'local:*') {
    return originalSpecifier
  }

  switch (entry.resolution.type) {
    case 'git':
      return `${toGitHubSpecifierSource(entry.resolution.url)}#${entry.resolution.commit}${formatPathSuffix(entry.resolution.path)}`
    case 'npm':
      return `npm:${entry.resolution.packageName}@${entry.resolution.version}${formatPathSuffix(entry.resolution.path)}`
    case 'file':
    case 'link':
    case 'local':
      return normalized.normalized
    default: {
      const _exhaustive: never = entry.resolution
      throw new Error(`Unsupported resolution type: ${_exhaustive}`)
    }
  }
}

export function parseNpmPackageName(source: string): string {
  const packageSpecifier = source.slice('npm:'.length)
  const scopedMatch = packageSpecifier.match(/^(@[^/]+\/[^@]+)(?:@.+)?$/)
  if (scopedMatch) {
    return scopedMatch[1]
  }

  const unscopedMatch = packageSpecifier.match(/^([^@]+)(?:@.+)?$/)
  if (unscopedMatch) {
    return unscopedMatch[1]
  }

  throw new Error(`Unsupported npm specifier: ${packageSpecifier}`)
}

export async function resolveLatestManifestSpecifier(
  cwd: string,
  normalized: NormalizedSpecifier,
): Promise<string> {
  if (normalized.type === 'git') {
    const commit = await resolveGitCommit(normalized.source, 'main')
    return `${toGitHubSpecifierSource(normalized.source)}#${commit}${formatPathSuffix(normalized.path)}`
  }

  if (normalized.type === 'npm') {
    const packageName = parseNpmPackageName(normalized.source)
    const resolved = await resolveNpmPackage(cwd, packageName)
    return `npm:${resolved.name}@${resolved.version}${formatPathSuffix(normalized.path)}`
  }

  return normalized.normalized
}

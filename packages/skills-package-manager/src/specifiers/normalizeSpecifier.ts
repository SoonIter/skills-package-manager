import path from 'node:path'
import type { NormalizedSpecifier } from '../config/types'
import { ErrorCode, ParseError } from '../errors'
import { normalizeLinkSource, normalizeLocalSource } from './normalizeLinkSource'
import { parseSpecifier } from './parseSpecifier'

type NormalizeSpecifierOptions = {
  installDir?: string
  skillName?: string
}

function normalizeSkillPath(skillPath: string): string {
  if (!skillPath) {
    return '/'
  }
  const normalized = skillPath.replace(/\\/g, '/')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function normalizeGitHubSource(sourcePart: string): {
  source: string
  normalizedSource: string
} | null {
  const match = sourcePart.match(/^github:([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (!match) {
    return null
  }

  const [, owner, repo] = match
  const cleanRepo = repo.replace(/\.git$/, '')
  return {
    source: `https://github.com/${owner}/${cleanRepo}.git`,
    normalizedSource: `github:${owner}/${cleanRepo}`,
  }
}

function inferRootSkillName(type: NormalizedSpecifier['type'], sourcePart: string): string {
  if (type === 'npm') {
    const packageName = sourcePart.slice('npm:'.length).replace(/@[^@/]+$/, '')
    return path.posix.basename(packageName)
  }

  if (type === 'git') {
    const githubSource = normalizeGitHubSource(sourcePart)
    const source = githubSource?.normalizedSource ?? sourcePart.replace(/\.git\/?$/, '')
    return path.posix.basename(source)
  }

  return ''
}

export function normalizeSpecifier(
  specifier: string,
  options: NormalizeSpecifierOptions = {},
): NormalizedSpecifier {
  if (
    (specifier.startsWith('link:') || specifier.startsWith('local:')) &&
    specifier.includes('#')
  ) {
    const protocol = specifier.startsWith('link:') ? 'link' : 'local'
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: `Invalid ${protocol} specifier: ${protocol}: must point directly to a skill directory`,
      content: specifier,
    })
  }

  let parsed: { sourcePart: string; ref: string | null; path: string }
  try {
    parsed = parseSpecifier(specifier)
  } catch (error) {
    if (error instanceof ParseError) {
      throw error
    }
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: `Invalid specifier: ${(error as Error).message}`,
      content: specifier,
      cause: error as Error,
    })
  }

  const type = parsed.sourcePart.startsWith('link:')
    ? 'link'
    : parsed.sourcePart.startsWith('local:')
      ? 'local'
      : parsed.sourcePart.startsWith('file:')
        ? 'file'
        : parsed.sourcePart.startsWith('npm:')
          ? 'npm'
          : 'git'

  if (type === 'link' || type === 'local') {
    const localSource =
      type === 'link'
        ? normalizeLinkSource(parsed.sourcePart)
        : parsed.sourcePart === 'local:*'
          ? normalizeLocalSource(
              `local:${path.posix.join(
                options.installDir ?? '.agents/skills',
                options.skillName ?? '*',
              )}`,
            )
          : normalizeLocalSource(parsed.sourcePart)
    const localPath = localSource.slice(`${type}:`.length)
    const skillName = path.posix.basename(localPath)

    return {
      type,
      source: localSource,
      ref: null,
      path: '/',
      normalized: localSource,
      skillName,
    }
  }

  const skillPath = normalizeSkillPath(parsed.path)
  const skillName =
    skillPath === '/'
      ? (options.skillName ?? inferRootSkillName(type, parsed.sourcePart))
      : path.posix.basename(skillPath)
  const githubSource = type === 'git' ? normalizeGitHubSource(parsed.sourcePart) : null
  const source = githubSource?.source ?? parsed.sourcePart
  const normalizedSource = githubSource?.normalizedSource ?? parsed.sourcePart
  const normalized = parsed.ref
    ? `${normalizedSource}#${parsed.ref}&path:${skillPath}`
    : parsed.path
      ? `${normalizedSource}&path:${skillPath}`
      : normalizedSource

  return {
    type,
    source,
    ref: parsed.ref,
    path: skillPath,
    normalized,
    skillName,
  }
}

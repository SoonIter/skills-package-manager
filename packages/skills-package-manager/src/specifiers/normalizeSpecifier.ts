import path from 'node:path'
import type { NormalizedSpecifier } from '../config/types'
import { ErrorCode, ParseError } from '../errors'
import { normalizeLinkSource, normalizeLocalSource } from './normalizeLinkSource'
import { parseSpecifier } from './parseSpecifier'

export function normalizeSpecifier(specifier: string): NormalizedSpecifier {
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

  const skillPath = parsed.path || '/'
  const skillName = path.posix.basename(skillPath)
  const normalized = parsed.ref
    ? `${parsed.sourcePart}#${parsed.ref}&path:${skillPath}`
    : parsed.path
      ? `${parsed.sourcePart}#path:${skillPath}`
      : parsed.sourcePart

  return {
    type,
    source: parsed.sourcePart,
    ref: parsed.ref,
    path: skillPath,
    normalized,
    skillName,
  }
}

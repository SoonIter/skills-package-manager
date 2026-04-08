import path from 'node:path'
import type { NormalizedSpecifier } from '../config/types'
import { ErrorCode, ParseError } from '../errors'
import { normalizeLinkSource } from './normalizeLinkSource'
import { parseSpecifier } from './parseSpecifier'

export function normalizeSpecifier(specifier: string): NormalizedSpecifier {
  if (specifier.startsWith('link:') && specifier.includes('#')) {
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: 'Invalid link specifier: link: must point directly to a skill directory',
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
    : parsed.sourcePart.startsWith('file:')
      ? 'file'
      : parsed.sourcePart.startsWith('npm:')
        ? 'npm'
        : 'git'

  if (type === 'link') {
    const linkSource = normalizeLinkSource(parsed.sourcePart)
    const linkPath = linkSource.slice('link:'.length)
    const skillName = path.posix.basename(linkPath)

    return {
      type,
      source: linkSource,
      ref: null,
      path: '/',
      normalized: linkSource,
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

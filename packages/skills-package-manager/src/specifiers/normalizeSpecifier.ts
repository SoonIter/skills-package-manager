import path from 'node:path'
import { ErrorCode, ParseError } from '../errors'
import type { NormalizedSpecifier } from '../config/types'
import { parseSpecifier } from './parseSpecifier'

export function normalizeSpecifier(specifier: string): NormalizedSpecifier {
  let parsed
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

  const type = parsed.sourcePart.startsWith('file:')
    ? 'file'
    : parsed.sourcePart.startsWith('npm:')
      ? 'npm'
      : 'git'

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

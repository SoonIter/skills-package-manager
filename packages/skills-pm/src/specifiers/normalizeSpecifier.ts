import path from 'node:path'
import type { NormalizedSpecifier } from '../config/types'
import { parseSpecifier } from './parseSpecifier'

export function normalizeSpecifier(specifier: string): NormalizedSpecifier {
  const parsed = parseSpecifier(specifier)
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

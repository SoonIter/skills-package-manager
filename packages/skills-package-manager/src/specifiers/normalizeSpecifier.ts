import type { NormalizedSpecifier } from '../config/types'
import { Specifier } from '../structures/Specifier'

export function normalizeSpecifier(specifier: string): NormalizedSpecifier {
  return Specifier.parse(specifier).toJSON()
}

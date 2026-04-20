import { Specifier } from '../structures/Specifier'

export function parseSpecifier(specifier: string) {
  return Specifier.parseFragment(specifier)
}

import type { NpmConfig } from '../npm/config'
import type { LockEntry } from '../structures/LockEntry'
import type { Specifier } from '../structures/Specifier'

export type ResolveContext = {
  rootDir: string
  skillName?: string
  npmConfig?: NpmConfig
}

export interface Resolver {
  supports(specifier: Specifier): boolean
  resolve(specifier: Specifier, context: ResolveContext): Promise<LockEntry>
}

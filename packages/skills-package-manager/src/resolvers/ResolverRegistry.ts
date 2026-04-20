import { ErrorCode, ParseError } from '../errors'
import type { LockEntry } from '../structures/LockEntry'
import { Specifier } from '../structures/Specifier'
import type { ResolveContext, Resolver } from './Resolver'

export class ResolverRegistry {
  private readonly resolvers: Resolver[]

  constructor(resolvers: Resolver[] = []) {
    this.resolvers = [...resolvers]
  }

  register(resolver: Resolver): ResolverRegistry {
    return new ResolverRegistry([...this.resolvers, resolver])
  }

  async resolve(specifier: Specifier | string, context: ResolveContext): Promise<LockEntry> {
    const normalizedSpecifier =
      typeof specifier === 'string' ? Specifier.parse(specifier) : specifier
    const resolver = this.resolvers.find((candidate) => candidate.supports(normalizedSpecifier))

    if (!resolver) {
      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message: `Unsupported specifier type: ${normalizedSpecifier.type}`,
        content: normalizedSpecifier.normalized,
      })
    }

    return resolver.resolve(normalizedSpecifier, context)
  }
}

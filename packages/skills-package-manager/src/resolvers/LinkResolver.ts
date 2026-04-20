import path from 'node:path'
import { LockEntry } from '../structures/LockEntry'
import { Resolution } from '../structures/Resolution'
import type { Specifier } from '../structures/Specifier'
import { sha256Directory } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'
import type { ResolveContext, Resolver } from './Resolver'

export class LinkResolver implements Resolver {
  supports(specifier: Specifier): boolean {
    return specifier.type === 'link'
  }

  async resolve(specifier: Specifier, context: ResolveContext): Promise<LockEntry> {
    const sourceRoot = path.resolve(context.rootDir, specifier.source.slice('link:'.length))
    return new LockEntry({
      specifier: specifier.normalized,
      resolution: Resolution.link(toPortableRelativePath(context.rootDir, sourceRoot)).toJSON(),
      digest: await sha256Directory(sourceRoot),
    })
  }
}

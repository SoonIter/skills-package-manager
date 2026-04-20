import path from 'node:path'
import { LockEntry } from '../structures/LockEntry'
import { Resolution } from '../structures/Resolution'
import type { Specifier } from '../structures/Specifier'
import { sha256File } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'
import type { ResolveContext, Resolver } from './Resolver'

export class FileResolver implements Resolver {
  supports(specifier: Specifier): boolean {
    return specifier.type === 'file'
  }

  async resolve(specifier: Specifier, context: ResolveContext): Promise<LockEntry> {
    const tarballPath = path.resolve(context.rootDir, specifier.source.slice('file:'.length))
    return new LockEntry({
      specifier: specifier.normalized,
      resolution: Resolution.file(
        toPortableRelativePath(context.rootDir, tarballPath),
        specifier.path,
      ).toJSON(),
      digest: await sha256File(tarballPath, `:${specifier.path}`),
    })
  }
}

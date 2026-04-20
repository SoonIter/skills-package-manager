import { resolveNpmPackage } from '../npm/packPackage'
import { LockEntry } from '../structures/LockEntry'
import { Resolution } from '../structures/Resolution'
import type { Specifier } from '../structures/Specifier'
import { sha256 } from '../utils/hash'
import type { ResolveContext, Resolver } from './Resolver'

export class NpmResolver implements Resolver {
  supports(specifier: Specifier): boolean {
    return specifier.type === 'npm'
  }

  async resolve(specifier: Specifier, context: ResolveContext): Promise<LockEntry> {
    const packageSpecifier = specifier.source.slice('npm:'.length)
    const resolved = await resolveNpmPackage(context.rootDir, packageSpecifier, context.npmConfig)
    return new LockEntry({
      specifier: specifier.normalized,
      resolution: Resolution.npm(
        resolved.name,
        resolved.version,
        specifier.path,
        resolved.tarballUrl,
        resolved.integrity,
        resolved.registry,
      ).toJSON(),
      digest: sha256(
        [
          resolved.name,
          resolved.version,
          resolved.tarballUrl,
          resolved.integrity ?? '',
          resolved.registry ?? '',
          specifier.path,
        ].join(':'),
      ),
    })
  }
}

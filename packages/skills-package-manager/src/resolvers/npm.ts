import type { SkillsLockEntry } from '../config/types'
import { resolveNpmPackage } from '../npm/packPackage'
import { sha256 } from '../utils/hash'

export async function resolveNpmEntry(
  cwd: string,
  source: string,
  path: string,
  skillName: string,
  specifier: string,
): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const packageSpecifier = source.slice('npm:'.length)
  const resolved = await resolveNpmPackage(cwd, packageSpecifier)

  return {
    skillName,
    entry: {
      specifier,
      resolution: {
        type: 'npm',
        packageName: resolved.name,
        version: resolved.version,
        path,
        tarball: resolved.tarballUrl,
        integrity: resolved.integrity,
        registry: resolved.registry,
      },
      digest: sha256(
        [
          resolved.name,
          resolved.version,
          resolved.tarballUrl,
          resolved.integrity ?? '',
          resolved.registry ?? '',
          path,
        ].join(':'),
      ),
    },
  }
}

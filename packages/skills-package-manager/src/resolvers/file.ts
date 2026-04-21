import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'
import { sha256File } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'

export async function resolveFileEntry(
  cwd: string,
  source: string,
  pathSegment: string,
  skillName: string,
  specifier: string,
): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const tarballPath = path.resolve(cwd, source.slice('file:'.length))
  return {
    skillName,
    entry: {
      specifier,
      resolution: {
        type: 'file',
        tarball: toPortableRelativePath(cwd, tarballPath),
        path: pathSegment,
      },
      digest: await sha256File(tarballPath, `:${pathSegment}`),
    },
  }
}

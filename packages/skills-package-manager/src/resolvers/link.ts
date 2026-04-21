import path from 'node:path'
import type { SkillsLockEntry } from '../config/types'
import { sha256Directory } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'

export async function resolveLinkEntry(
  cwd: string,
  source: string,
  skillName: string,
  specifier: string,
): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const sourceRoot = path.resolve(cwd, source.slice('link:'.length))
  return {
    skillName,
    entry: {
      specifier,
      resolution: {
        type: 'link',
        path: toPortableRelativePath(cwd, sourceRoot),
      },
      digest: await sha256Directory(sourceRoot),
    },
  }
}

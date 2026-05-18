import path from 'node:path'
import type { ResolvedSkillEntry } from '../config/types'
import { toPortableRelativePath } from '../utils/path'

export async function resolveLocalEntry(
  cwd: string,
  source: string,
  skillName: string,
  specifier: string,
): Promise<{ skillName: string; entry: ResolvedSkillEntry }> {
  const sourceRoot = path.resolve(cwd, source.slice('local:'.length))
  return {
    skillName,
    entry: {
      specifier,
      resolution: {
        type: 'local',
        path: toPortableRelativePath(cwd, sourceRoot),
      },
      digest: '',
    },
  }
}

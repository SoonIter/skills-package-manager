import {
  getBundledSelfSkillSpecifier,
  SELF_SKILL_NAME,
  shouldInjectBundledSelfSkill,
} from '../config/skillsManifest'
import { resolveLockEntry } from '../config/syncSkillsLock'
import type { SkillsLock, SkillsManifest } from '../config/types'

export const installStageHooks = {
  beforeFetch: async (_rootDir: string, _manifest: SkillsManifest, _lockfile: SkillsLock) => {},
}

export async function withBundledSelfSkillLock(
  rootDir: string,
  manifest: SkillsManifest,
  lockfile: SkillsLock,
): Promise<SkillsLock> {
  if (!shouldInjectBundledSelfSkill(manifest) || lockfile.skills[SELF_SKILL_NAME]) {
    return lockfile
  }

  const { entry } = await resolveLockEntry(rootDir, getBundledSelfSkillSpecifier(), SELF_SKILL_NAME)

  return {
    ...lockfile,
    skills: {
      ...lockfile.skills,
      [SELF_SKILL_NAME]: entry,
    },
  }
}

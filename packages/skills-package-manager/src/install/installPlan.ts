import type { ResolvedSkillsPlan, SkillsManifest } from '../config/types'

export const installStageHooks = {
  beforeFetch: async (_rootDir: string, _manifest: SkillsManifest, _plan: ResolvedSkillsPlan) => {},
}

import { Manifest, SELF_SKILL_NAME } from '../structures/Manifest'
import type { NormalizedSkillsManifest, SkillsManifest } from './types'

export { SELF_SKILL_NAME }

export function getBundledSelfSkillSpecifier(): string {
  return Manifest.getBundledSelfSkillSpecifier()
}

export function shouldInjectBundledSelfSkill(manifest: SkillsManifest): boolean {
  return Manifest.from(manifest).normalize().selfSkill === true
}

export function normalizeSkillsManifest(
  manifest: Partial<SkillsManifest>,
): NormalizedSkillsManifest {
  return Manifest.from(manifest).normalize()
}

export async function expandSkillsManifest(
  _rootDir: string,
  manifest: SkillsManifest,
): Promise<NormalizedSkillsManifest> {
  return Manifest.from(manifest).withBundledSelfSkill().normalize()
}

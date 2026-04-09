import { discoverSelfSkillsInDir } from '../github/listSkills'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import type { SkillsManifest } from './types'

function buildSelfSkillSpecifier(skillPath: string): string {
  return `link:.${skillPath}`
}

function hasEquivalentSkillSpecifier(manifest: SkillsManifest, specifier: string): boolean {
  const normalizedTarget = normalizeSpecifier(specifier).normalized
  return Object.values(manifest.skills).some((existingSpecifier) => {
    try {
      return normalizeSpecifier(existingSpecifier).normalized === normalizedTarget
    } catch {
      return false
    }
  })
}

export function normalizeSkillsManifest(manifest: Partial<SkillsManifest>): SkillsManifest {
  return {
    $schema: manifest.$schema,
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    selfSkill: manifest.selfSkill ?? false,
    skills: manifest.skills ?? {},
  }
}

export async function expandSkillsManifest(
  rootDir: string,
  manifest: SkillsManifest,
): Promise<SkillsManifest> {
  const normalized = normalizeSkillsManifest(manifest)

  if (!normalized.selfSkill) {
    return normalized
  }

  const discoveredSkills = await discoverSelfSkillsInDir(rootDir)
  if (discoveredSkills.length !== 1) {
    return normalized
  }

  const [selfSkill] = discoveredSkills
  const selfSpecifier = buildSelfSkillSpecifier(selfSkill.path)

  if (
    selfSkill.name in normalized.skills ||
    hasEquivalentSkillSpecifier(normalized, selfSpecifier)
  ) {
    return normalized
  }

  return {
    ...normalized,
    skills: {
      ...normalized.skills,
      [selfSkill.name]: selfSpecifier,
    },
  }
}

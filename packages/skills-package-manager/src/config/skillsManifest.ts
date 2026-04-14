import { accessSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeLinkSource } from '../specifiers/normalizeLinkSource'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import type { SkillsManifest } from './types'

export const SELF_SKILL_NAME = 'skills-package-manager-cli'
const SELF_SKILL_CANDIDATE_PATHS = [
  '../skills/skills-package-manager-cli',
  '../../skills/skills-package-manager-cli',
]
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))

function resolveBundledSelfSkillDir(): string {
  for (const relativePath of SELF_SKILL_CANDIDATE_PATHS) {
    const candidate = path.resolve(MODULE_DIR, relativePath)
    try {
      accessSync(path.join(candidate, 'SKILL.md'))
      return candidate
    } catch {}
  }

  throw new Error('Unable to locate bundled skills-package-manager-cli skill')
}

export function getBundledSelfSkillSpecifier(): string {
  return normalizeLinkSource(`link:${resolveBundledSelfSkillDir()}`)
}

export function shouldInjectBundledSelfSkill(manifest: SkillsManifest): boolean {
  return normalizeSkillsManifest(manifest).selfSkill === true
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
    pnpmPlugin: manifest.pnpmPlugin,
    skills: manifest.skills ?? {},
  }
}

export async function expandSkillsManifest(
  _rootDir: string,
  manifest: SkillsManifest,
): Promise<SkillsManifest> {
  const normalized = normalizeSkillsManifest(manifest)

  if (!normalized.selfSkill) {
    return normalized
  }

  const selfSpecifier = getBundledSelfSkillSpecifier()
  if (
    SELF_SKILL_NAME in normalized.skills ||
    hasEquivalentSkillSpecifier(normalized, selfSpecifier)
  ) {
    return normalized
  }

  return {
    ...normalized,
    skills: {
      ...normalized.skills,
      [SELF_SKILL_NAME]: selfSpecifier,
    },
  }
}

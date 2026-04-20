import { accessSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeLinkSource } from '../specifiers/normalizeLinkSource'
import { Specifier } from './Specifier'
import type { ManifestData, NormalizedManifestData } from './types'

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

export class Manifest {
  readonly $schema?: string
  readonly installDir?: string
  readonly linkTargets?: string[]
  readonly selfSkill?: boolean
  readonly skills?: Record<string, string>
  readonly patchedSkills?: Record<string, string>

  constructor(data: Partial<ManifestData> = {}) {
    this.$schema = data.$schema
    this.installDir = data.installDir
    this.linkTargets = data.linkTargets ? [...data.linkTargets] : undefined
    this.selfSkill = data.selfSkill
    this.skills = data.skills ? { ...data.skills } : undefined
    this.patchedSkills = data.patchedSkills ? { ...data.patchedSkills } : undefined
  }

  static from(data: Partial<ManifestData> = {}): Manifest {
    return new Manifest(data)
  }

  static getBundledSelfSkillSpecifier(): string {
    return normalizeLinkSource(`link:${resolveBundledSelfSkillDir()}`)
  }

  normalize(): NormalizedManifestData {
    return {
      $schema: this.$schema,
      installDir: this.installDir ?? '.agents/skills',
      linkTargets: [...(this.linkTargets ?? [])],
      selfSkill: this.selfSkill ?? false,
      skills: { ...(this.skills ?? {}) },
      ...(this.patchedSkills ? { patchedSkills: { ...this.patchedSkills } } : {}),
    }
  }

  withBundledSelfSkill(): Manifest {
    const normalized = this.normalize()
    if (!normalized.selfSkill) {
      return new Manifest(normalized)
    }

    const selfSpecifier = Manifest.getBundledSelfSkillSpecifier()
    const existingSkills = normalized.skills
    if (SELF_SKILL_NAME in existingSkills) {
      return new Manifest(normalized)
    }

    const normalizedSelfSpecifier = Specifier.parse(selfSpecifier)
    const hasEquivalent = Object.values(existingSkills).some((specifier) => {
      try {
        return Specifier.parse(specifier).isEquivalentTo(normalizedSelfSpecifier)
      } catch {
        return false
      }
    })

    if (hasEquivalent) {
      return new Manifest(normalized)
    }

    return new Manifest({
      ...normalized,
      skills: {
        ...existingSkills,
        [SELF_SKILL_NAME]: selfSpecifier,
      },
    })
  }

  hasSkill(skillName: string): boolean {
    return skillName in (this.skills ?? {})
  }

  getSkillSpecifier(skillName: string): string | undefined {
    return this.skills?.[skillName]
  }

  toJSON(options?: { includeDefaults?: boolean; defaultSchemaUrl?: string }): ManifestData {
    const includeDefaults = options?.includeDefaults === true
    const normalized = this.normalize()

    if (!includeDefaults) {
      return {
        ...(this.$schema ? { $schema: this.$schema } : {}),
        ...(this.installDir !== undefined ? { installDir: this.installDir } : {}),
        ...(this.linkTargets !== undefined ? { linkTargets: [...this.linkTargets] } : {}),
        ...(this.selfSkill !== undefined ? { selfSkill: this.selfSkill } : {}),
        ...(this.skills ? { skills: { ...this.skills } } : {}),
        ...(this.patchedSkills ? { patchedSkills: { ...this.patchedSkills } } : {}),
      }
    }

    return {
      $schema: this.$schema ?? options?.defaultSchemaUrl,
      installDir: normalized.installDir,
      linkTargets: normalized.linkTargets,
      ...(this.selfSkill !== undefined ? { selfSkill: this.selfSkill } : {}),
      skills: normalized.skills,
      ...(normalized.patchedSkills ? { patchedSkills: normalized.patchedSkills } : {}),
    }
  }
}

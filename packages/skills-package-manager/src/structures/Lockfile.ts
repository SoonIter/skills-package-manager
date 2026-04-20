import path from 'node:path'
import { sha256File } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'
import { LockEntry } from './LockEntry'
import type { Manifest } from './Manifest'
import { Specifier } from './Specifier'
import type { LockEntryData, LockfileData } from './types'

export class Lockfile {
  readonly lockfileVersion: '0.1'
  readonly installDir: string
  readonly linkTargets: string[]
  readonly skills: Record<string, LockEntry>

  constructor(data: LockfileData) {
    this.lockfileVersion = data.lockfileVersion
    this.installDir = data.installDir
    this.linkTargets = [...data.linkTargets]
    this.skills = Object.fromEntries(
      Object.entries(data.skills).map(([skillName, entry]) => [skillName, new LockEntry(entry)]),
    )
  }

  static from(data: LockfileData): Lockfile {
    return new Lockfile(data)
  }

  static empty(manifest?: Manifest): Lockfile {
    const normalized = manifest?.normalize()
    return new Lockfile({
      lockfileVersion: '0.1',
      installDir: normalized?.installDir ?? '.agents/skills',
      linkTargets: normalized?.linkTargets ?? [],
      skills: {},
    })
  }

  clone(): Lockfile {
    return new Lockfile(this.toJSON())
  }

  withEntry(skillName: string, entry: LockEntry | LockEntryData): Lockfile {
    const nextEntry = entry instanceof LockEntry ? entry : new LockEntry(entry)
    return new Lockfile({
      ...this.toJSON(),
      skills: {
        ...this.toJSON().skills,
        [skillName]: nextEntry.toJSON(),
      },
    })
  }

  withManifest(manifest: Manifest): Lockfile {
    const normalized = manifest.normalize()
    return new Lockfile({
      ...this.toJSON(),
      installDir: normalized.installDir,
      linkTargets: normalized.linkTargets,
    })
  }

  skillNames(): string[] {
    return Object.keys(this.skills)
  }

  getEntry(skillName: string): LockEntry | undefined {
    return this.skills[skillName]
  }

  entries(): Array<[string, LockEntry]> {
    return Object.entries(this.skills)
  }

  async isInSyncWith(manifest: Manifest, rootDir: string): Promise<boolean> {
    const normalizedManifest = manifest.normalize()

    if (normalizedManifest.installDir !== this.installDir) {
      return false
    }

    if (
      normalizedManifest.linkTargets.length !== this.linkTargets.length ||
      !normalizedManifest.linkTargets.every((value, index) => value === this.linkTargets[index])
    ) {
      return false
    }

    const manifestSkills = Object.entries(normalizedManifest.skills)
    const lockSkillNames = this.skillNames()
    const patchedSkillNames = Object.keys(normalizedManifest.patchedSkills ?? {})

    if (manifestSkills.length !== lockSkillNames.length) {
      return false
    }

    if (patchedSkillNames.some((skillName) => !(skillName in normalizedManifest.skills))) {
      return false
    }

    for (const [skillName, manifestSpecifier] of manifestSkills) {
      const lockEntry = this.skills[skillName]
      if (!lockEntry) {
        return false
      }

      const manifestParsed = Specifier.parse(manifestSpecifier)
      const lockParsed = Specifier.parse(lockEntry.specifier)
      if (manifestParsed.source !== lockParsed.source || manifestParsed.path !== lockParsed.path) {
        return false
      }
      if (manifestParsed.ref !== null && manifestParsed.ref !== lockParsed.ref) {
        return false
      }

      const manifestPatchPath = normalizedManifest.patchedSkills?.[skillName]
      if (!manifestPatchPath) {
        if (lockEntry.patch !== undefined) {
          return false
        }
        continue
      }

      if (!lockEntry.patch) {
        return false
      }

      const absolutePatchPath = path.resolve(rootDir, manifestPatchPath)
      const normalizedPatchPath = toPortableRelativePath(rootDir, absolutePatchPath)
      if (lockEntry.patch.path !== normalizedPatchPath) {
        return false
      }
      if (lockEntry.patch.digest !== (await sha256File(absolutePatchPath))) {
        return false
      }
    }

    return true
  }

  toYAMLObject(): LockfileData {
    return this.toJSON()
  }

  toJSON(): LockfileData {
    return {
      lockfileVersion: this.lockfileVersion,
      installDir: this.installDir,
      linkTargets: [...this.linkTargets],
      skills: Object.fromEntries(
        Object.entries(this.skills).map(([skillName, entry]) => [skillName, entry.toJSON()]),
      ),
    }
  }
}

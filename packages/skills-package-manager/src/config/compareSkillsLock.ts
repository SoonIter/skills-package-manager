import path from 'node:path'
import { normalizeLinkSource } from '../specifiers/normalizeLinkSource'
import { parseSpecifier } from '../specifiers/parseSpecifier'
import { sha256File } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'
import type { NormalizedSkillsManifest, SkillsLock } from './types'

interface ParsedSpecifier {
  sourcePart: string
  ref: string | null
  path: string
}

function parseForComparison(specifier: string): ParsedSpecifier {
  const parsed = parseSpecifier(specifier)
  const isLink = parsed.sourcePart.startsWith('link:')
  return {
    sourcePart: isLink ? normalizeLinkSource(parsed.sourcePart) : parsed.sourcePart,
    ref: isLink ? null : parsed.ref,
    path: isLink ? '/' : parsed.path || '/',
  }
}

function isSpecifierCompatible(manifestSpecifier: string, lockSpecifier: string): boolean {
  const manifest = parseForComparison(manifestSpecifier)
  const lock = parseForComparison(lockSpecifier)

  if (manifest.sourcePart !== lock.sourcePart) {
    return false
  }

  if (manifest.path !== lock.path) {
    return false
  }

  if (manifest.ref === null) {
    return true
  }

  return manifest.ref === lock.ref
}

function normalizeInstallDir(dir: string | undefined): string {
  return dir ?? '.agents/skills'
}

function normalizeLinkTargets(targets: string[] | undefined): string[] {
  return targets ?? []
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((val, i) => val === b[i])
}

async function isPatchInSync(
  rootDir: string,
  manifest: NormalizedSkillsManifest,
  skillName: string,
  lock: SkillsLock,
): Promise<boolean> {
  const lockEntry = lock.skills[skillName]
  if (!lockEntry) {
    return false
  }

  const manifestPatchPath = manifest.patchedSkills?.[skillName]
  if (!manifestPatchPath) {
    return lockEntry.patch === undefined
  }

  if (!lockEntry.patch) {
    return false
  }

  const absolutePatchPath = path.resolve(rootDir, manifestPatchPath)
  const normalizedPatchPath = toPortableRelativePath(rootDir, absolutePatchPath)

  if (lockEntry.patch.path !== normalizedPatchPath) {
    return false
  }

  return lockEntry.patch.digest === (await sha256File(absolutePatchPath))
}

export async function isLockInSync(
  rootDir: string,
  manifest: NormalizedSkillsManifest,
  lock: SkillsLock | null,
): Promise<boolean> {
  if (!lock) return false

  if (normalizeInstallDir(manifest.installDir) !== normalizeInstallDir(lock.installDir)) {
    return false
  }

  if (
    !arraysEqual(normalizeLinkTargets(manifest.linkTargets), normalizeLinkTargets(lock.linkTargets))
  ) {
    return false
  }

  const manifestSkills = Object.entries(manifest.skills)
  const lockSkillNames = Object.keys(lock.skills)
  const patchedSkillNames = Object.keys(manifest.patchedSkills ?? {})

  if (manifestSkills.length !== lockSkillNames.length) {
    return false
  }

  if (patchedSkillNames.some((skillName) => !(skillName in manifest.skills))) {
    return false
  }

  for (const [name, specifier] of manifestSkills) {
    const lockEntry = lock.skills[name]
    if (!lockEntry) return false
    if (!isSpecifierCompatible(specifier, lockEntry.specifier)) return false
    if (!(await isPatchInSync(rootDir, manifest, name, lock))) return false
  }

  return true
}

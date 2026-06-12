import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extractGitSkillToPath } from '../fetchers/git'
import { copyLocalSkillToDir } from '../install/materializeLocalSkill'
import { extractPackedSkillToDir } from '../install/materializePackedSkill'
import { downloadNpmPackageTarball } from '../npm/packPackage'
import { applySkillPatch } from '../patches/skillPatch'
import { parseSkillFrontmatter } from '../skills/frontmatter'
import { formatResolvedManifestSpecifier } from '../specifiers/formatResolvedSpecifier'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { attachManifestPatchToEntry, resolveSkillEntry } from './resolveSkillsPlan'
import { normalizeSkillsManifest } from './skillsManifest'
import type {
  NormalizedSkillsManifest,
  ResolvedSkillEntry,
  SkillDependencyWarning,
  SkillsManifest,
} from './types'

type QueuedSkill = {
  name: string
  specifier: string
  kind: 'root' | 'dependency'
}

type DependencySelection = {
  specifier: string
  normalized: string
  sourceSkillName: string
}

export type ResolveManifestDependenciesResult = {
  manifest: NormalizedSkillsManifest
  warnings: SkillDependencyWarning[]
}

function cloneManifest(manifest: SkillsManifest): NormalizedSkillsManifest {
  const normalized = normalizeSkillsManifest(manifest)
  return {
    ...normalized,
    selfSkill: manifest.selfSkill,
    skills: { ...normalized.skills },
    dependencies: { ...normalized.dependencies },
    patchedSkills: normalized.patchedSkills ? { ...normalized.patchedSkills } : undefined,
  }
}

function createWarning(
  warning: SkillDependencyWarning,
  warnings: SkillDependencyWarning[],
  onWarning?: (warning: SkillDependencyWarning) => void,
) {
  warnings.push(warning)
  onWarning?.(warning)
}

async function materializeSkillForFrontmatter(
  cwd: string,
  skillName: string,
  entry: ResolvedSkillEntry,
): Promise<{ skillDir: string; cleanup: () => Promise<void> }> {
  if (entry.resolution.type === 'local') {
    return {
      skillDir: path.resolve(cwd, entry.resolution.path),
      cleanup: async () => {},
    }
  }

  if (entry.resolution.type === 'link' && !entry.patch) {
    return {
      skillDir: path.resolve(cwd, entry.resolution.path),
      cleanup: async () => {},
    }
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'skills-pm-dependency-'))
  const skillDir = path.join(tempDir, skillName)

  try {
    switch (entry.resolution.type) {
      case 'link':
        await copyLocalSkillToDir(path.resolve(cwd, entry.resolution.path), '/', skillDir)
        break
      case 'file':
        await extractPackedSkillToDir(
          path.resolve(cwd, entry.resolution.tarball),
          entry.resolution.path,
          skillDir,
        )
        break
      case 'git':
        await extractGitSkillToPath(entry, skillDir)
        break
      case 'npm': {
        const { tarballPath } = await downloadNpmPackageTarball(
          cwd,
          entry.resolution.tarball,
          entry.resolution.integrity,
        )
        await extractPackedSkillToDir(tarballPath, entry.resolution.path, skillDir)
        break
      }
      default: {
        const _exhaustive: never = entry.resolution
        throw new Error(`Unsupported resolution type: ${_exhaustive}`)
      }
    }

    if (entry.patch) {
      await applySkillPatch(skillDir, path.resolve(cwd, entry.patch.path))
    }

    return {
      skillDir,
      cleanup: async () => {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {})
      },
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

async function readSkillDependencies(
  cwd: string,
  skillName: string,
  entry: ResolvedSkillEntry,
): Promise<{
  dependencies: Record<string, string>
  warnings: SkillDependencyWarning[]
}> {
  const { skillDir, cleanup } = await materializeSkillForFrontmatter(cwd, skillName, entry)

  try {
    let content: string
    try {
      content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')
    } catch {
      throw new Error(`Invalid skill at ${skillDir}: missing SKILL.md`)
    }
    const parsed = parseSkillFrontmatter(content)
    return {
      dependencies: parsed.frontmatter.dependencies,
      warnings: parsed.warnings.map((warning) => ({
        ...warning,
        skillName,
        message: `${skillName}: ${warning.message}`,
      })),
    }
  } finally {
    await cleanup()
  }
}

export async function resolveManifestDependencies(
  cwd: string,
  manifest: SkillsManifest,
  options: {
    onWarning?: (warning: SkillDependencyWarning) => void
  } = {},
): Promise<ResolveManifestDependenciesResult> {
  const nextManifest = cloneManifest(manifest)
  const warnings: SkillDependencyWarning[] = []
  const rootNames = new Set(Object.keys(nextManifest.skills))
  const existingDependencies = { ...nextManifest.dependencies }
  const selectedDependencies = new Map<string, DependencySelection>()
  const dependencyOrder: string[] = []
  const pinnedDependencies = new Map<string, string>()
  const processed = new Set<string>()
  const queue: QueuedSkill[] = Object.entries(nextManifest.skills).map(([name, specifier]) => ({
    name,
    specifier,
    kind: 'root',
  }))

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    if (processed.has(current.name)) {
      continue
    }
    processed.add(current.name)

    const normalized = normalizeSpecifier(current.specifier, {
      installDir: nextManifest.installDir,
      skillName: current.name,
    })
    const { entry } = await resolveSkillEntry(cwd, current.specifier, current.name, {
      installDir: nextManifest.installDir,
    })
    const entryWithPatch = await attachManifestPatchToEntry(cwd, nextManifest, current.name, entry)

    if (current.kind === 'dependency') {
      pinnedDependencies.set(
        current.name,
        formatResolvedManifestSpecifier(normalized, entryWithPatch, current.specifier),
      )
    }

    const dependencyRead = await readSkillDependencies(cwd, current.name, entryWithPatch)
    for (const warning of dependencyRead.warnings) {
      createWarning(warning, warnings, options.onWarning)
    }

    for (const [dependencyName, declaredSpecifier] of Object.entries(dependencyRead.dependencies)) {
      if (rootNames.has(dependencyName)) {
        continue
      }

      let declaredNormalized: string
      try {
        declaredNormalized = normalizeSpecifier(declaredSpecifier, {
          installDir: nextManifest.installDir,
          skillName: dependencyName,
        }).normalized
      } catch (error) {
        createWarning(
          {
            code: 'invalid-dependency-specifier',
            skillName: current.name,
            dependencyName,
            specifier: declaredSpecifier,
            message: `${current.name}: invalid dependency "${dependencyName}" specifier "${declaredSpecifier}": ${(error as Error).message}. Skipping it.`,
          },
          warnings,
          options.onWarning,
        )
        continue
      }

      const existingSelection = selectedDependencies.get(dependencyName)
      const manifestOverride = existingDependencies[dependencyName]
      if (existingSelection) {
        if (!manifestOverride && existingSelection.normalized !== declaredNormalized) {
          createWarning(
            {
              code: 'dependency-conflict',
              skillName: current.name,
              dependencyName,
              specifier: declaredSpecifier,
              message: `${current.name}: dependency "${dependencyName}" also appears in ${existingSelection.sourceSkillName}; using the first specifier "${existingSelection.specifier}" and ignoring "${declaredSpecifier}".`,
            },
            warnings,
            options.onWarning,
          )
        }
        continue
      }

      const selectedSpecifier = manifestOverride ?? declaredSpecifier
      let selectedNormalized: string
      try {
        selectedNormalized = normalizeSpecifier(selectedSpecifier, {
          installDir: nextManifest.installDir,
          skillName: dependencyName,
        }).normalized
      } catch (error) {
        createWarning(
          {
            code: 'invalid-dependency-specifier',
            skillName: current.name,
            dependencyName,
            specifier: selectedSpecifier,
            message: `${current.name}: invalid dependency "${dependencyName}" specifier "${selectedSpecifier}": ${(error as Error).message}. Skipping it.`,
          },
          warnings,
          options.onWarning,
        )
        continue
      }

      selectedDependencies.set(dependencyName, {
        specifier: selectedSpecifier,
        normalized: selectedNormalized,
        sourceSkillName: current.name,
      })
      dependencyOrder.push(dependencyName)
      queue.push({
        name: dependencyName,
        specifier: selectedSpecifier,
        kind: 'dependency',
      })
    }
  }

  const orderedDependencies: Record<string, string> = {}
  for (const dependencyName of Object.keys(existingDependencies)) {
    const pinnedSpecifier = pinnedDependencies.get(dependencyName)
    if (pinnedSpecifier) {
      orderedDependencies[dependencyName] = pinnedSpecifier
    }
  }

  for (const dependencyName of dependencyOrder) {
    if (dependencyName in orderedDependencies) {
      continue
    }

    const pinnedSpecifier = pinnedDependencies.get(dependencyName)
    if (pinnedSpecifier) {
      orderedDependencies[dependencyName] = pinnedSpecifier
    }
  }

  nextManifest.dependencies = orderedDependencies
  return { manifest: nextManifest, warnings }
}

export function areManifestDependenciesEqual(
  left: NormalizedSkillsManifest,
  right: NormalizedSkillsManifest,
): boolean {
  const leftEntries = Object.entries(left.dependencies)
  const rightEntries = Object.entries(right.dependencies)
  if (leftEntries.length !== rightEntries.length) {
    return false
  }

  return leftEntries.every(([name, specifier], index) => {
    const [rightName, rightSpecifier] = rightEntries[index] ?? []
    return name === rightName && specifier === rightSpecifier
  })
}

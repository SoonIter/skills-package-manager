import { resolveSkillsPlan } from '../config/resolveSkillsPlan'
import {
  areManifestDependenciesEqual,
  resolveManifestDependencies,
} from '../config/skillDependencies'
import type {
  NormalizedSkillsManifest,
  UpdateCommandOptions,
  UpdateCommandResult,
} from '../config/types'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'
import { resolveLatestManifestSpecifier } from '../specifiers/formatResolvedSpecifier'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'

function createEmptyResult(): UpdateCommandResult {
  return {
    status: 'skipped',
    updated: [],
    unchanged: [],
    skipped: [],
    failed: [],
    warnings: [],
  }
}

async function resolveUpdatedSpecifier(
  cwd: string,
  manifest: NormalizedSkillsManifest,
  skillName: string,
  currentSpecifier: string,
): Promise<{ specifier: string; skipped?: UpdateCommandResult['skipped'][number]['reason'] }> {
  const normalized = normalizeSpecifier(currentSpecifier, {
    installDir: manifest.installDir,
    skillName,
  })

  if (normalized.type === 'link') {
    return { specifier: currentSpecifier, skipped: 'link-specifier' }
  }
  if (normalized.type === 'local') {
    return { specifier: currentSpecifier, skipped: 'local-specifier' }
  }
  if (normalized.type === 'file') {
    return { specifier: currentSpecifier, skipped: 'file-specifier' }
  }

  return { specifier: await resolveLatestManifestSpecifier(cwd, normalized) }
}

function createManifestSnapshot(manifest: NormalizedSkillsManifest): string {
  return JSON.stringify({
    skills: manifest.skills,
    dependencies: manifest.dependencies,
  })
}

export async function updateCommand(options: UpdateCommandOptions): Promise<UpdateCommandResult> {
  const ctx = await loadConfig(options.cwd)

  if (!ctx.manifest.skills || Object.keys(ctx.manifest.skills).length === 0) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  const targetSkills = options.skills
    ? options.skills
    : [
        ...Object.keys(ctx.manifest.skills),
        ...Object.keys(ctx.manifest.dependencies).filter(
          (skillName) => !(skillName in ctx.manifest.skills),
        ),
      ]
  for (const skillName of options.skills ?? []) {
    if (!(skillName in ctx.manifest.skills)) {
      throw new SkillError({
        code: ErrorCode.SKILL_NOT_FOUND,
        skillName,
        message: `Unknown skill: ${skillName}`,
      })
    }
  }

  const result = createEmptyResult()
  const nextManifest: NormalizedSkillsManifest = {
    ...ctx.manifest,
    skills: { ...ctx.manifest.skills },
    dependencies: { ...ctx.manifest.dependencies },
  }
  const initialSnapshot = createManifestSnapshot(nextManifest)

  for (const skillName of targetSkills) {
    const section = skillName in nextManifest.skills ? 'skills' : 'dependencies'
    const currentSpecifier = nextManifest[section][skillName]

    try {
      const update = await resolveUpdatedSpecifier(
        options.cwd,
        ctx.manifest,
        skillName,
        currentSpecifier,
      )
      if (update.skipped) {
        result.skipped.push({ name: skillName, reason: update.skipped })
        continue
      }

      if (currentSpecifier === update.specifier) {
        result.unchanged.push(skillName)
        continue
      }

      nextManifest[section][skillName] = update.specifier
      result.updated.push(skillName)
    } catch (error) {
      result.failed.push({ name: skillName, reason: (error as Error).message })
    }
  }

  if (result.failed.length > 0) {
    result.status = 'failed'
    return result
  }

  const dependencyResult = await resolveManifestDependencies(options.cwd, nextManifest, {
    onWarning: options.onWarning,
  })
  result.warnings = dependencyResult.warnings
  const finalManifest = dependencyResult.manifest
  const plan = await resolveSkillsPlan(options.cwd, finalManifest)
  await runPipeline({
    ctx: {
      ...ctx,
      manifest: finalManifest,
    },
    plan,
    skipResolve: true,
  })

  const dependenciesChanged = !areManifestDependenciesEqual(ctx.manifest, finalManifest)
  const manifestChanged = initialSnapshot !== createManifestSnapshot(finalManifest)
  if (result.updated.length > 0 || dependenciesChanged || manifestChanged) {
    await writeSkillsManifest(options.cwd, finalManifest)
  }

  result.status = result.updated.length > 0 || manifestChanged ? 'updated' : 'skipped'
  return result
}

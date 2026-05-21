import { resolveSkillsPlan } from '../config/resolveSkillsPlan'
import type {
  NormalizedSkillsManifest,
  UpdateCommandOptions,
  UpdateCommandResult,
} from '../config/types'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { resolveNpmPackage } from '../npm/packPackage'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'
import { resolveGitCommit } from '../resolvers/git'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'

function createEmptyResult(): UpdateCommandResult {
  return {
    status: 'skipped',
    updated: [],
    unchanged: [],
    skipped: [],
    failed: [],
  }
}

function formatPathSuffix(skillPath: string): string {
  return skillPath === '/' ? '' : `&path:${skillPath}`
}

function toGitHubSpecifierSource(repoUrl: string): string {
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (!match) {
    return repoUrl
  }

  const [, owner, repo] = match
  return `github:${owner}/${repo.replace(/\.git$/, '')}`
}

function parseNpmPackageName(source: string): string {
  const packageSpecifier = source.slice('npm:'.length)
  const scopedMatch = packageSpecifier.match(/^(@[^/]+\/[^@]+)(?:@.+)?$/)
  if (scopedMatch) {
    return scopedMatch[1]
  }

  const unscopedMatch = packageSpecifier.match(/^([^@]+)(?:@.+)?$/)
  if (unscopedMatch) {
    return unscopedMatch[1]
  }

  throw new Error(`Unsupported npm specifier: ${packageSpecifier}`)
}

async function resolveUpdatedSpecifier(
  cwd: string,
  manifest: NormalizedSkillsManifest,
  skillName: string,
): Promise<{ specifier: string; skipped?: UpdateCommandResult['skipped'][number]['reason'] }> {
  const currentSpecifier = manifest.skills[skillName]
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
  if (normalized.type === 'git') {
    const commit = await resolveGitCommit(normalized.source, 'main')
    return {
      specifier: `${toGitHubSpecifierSource(normalized.source)}#${commit}${formatPathSuffix(normalized.path)}`,
    }
  }

  const packageName = parseNpmPackageName(normalized.source)
  const resolved = await resolveNpmPackage(cwd, packageName)
  return {
    specifier: `npm:${resolved.name}@${resolved.version}${formatPathSuffix(normalized.path)}`,
  }
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

  const targetSkills = options.skills ?? Object.keys(ctx.manifest.skills)
  for (const skillName of targetSkills) {
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
  }

  for (const skillName of targetSkills) {
    try {
      const update = await resolveUpdatedSpecifier(options.cwd, ctx.manifest, skillName)
      if (update.skipped) {
        result.skipped.push({ name: skillName, reason: update.skipped })
        continue
      }

      if (ctx.manifest.skills[skillName] === update.specifier) {
        result.unchanged.push(skillName)
        continue
      }

      nextManifest.skills[skillName] = update.specifier
      result.updated.push(skillName)
    } catch (error) {
      result.failed.push({ name: skillName, reason: (error as Error).message })
    }
  }

  if (result.failed.length > 0) {
    result.status = 'failed'
    return result
  }

  const plan = await resolveSkillsPlan(options.cwd, nextManifest)
  await runPipeline({
    ctx: {
      ...ctx,
      manifest: nextManifest,
    },
    plan,
    skipResolve: true,
  })

  if (result.updated.length > 0) {
    await writeSkillsManifest(options.cwd, nextManifest)
  }

  result.status = result.updated.length > 0 ? 'updated' : 'skipped'
  return result
}

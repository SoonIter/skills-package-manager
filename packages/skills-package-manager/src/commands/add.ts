import * as p from '@clack/prompts'
import pc from 'picocolors'
import { ErrorCode, ParseError, SkillError } from '../errors'
import { promptSkillSelection } from '../cli/prompt'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { AddCommandOptions } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { listRepoSkills, parseGitHubUrl, parseOwnerRepo } from '../github/listSkills'
import { installSkills } from '../install/installSkills'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'

function isProtocolSpecifier(specifier: string): boolean {
  return /^[a-z]+:/.test(specifier)
}

function buildGitHubSpecifier(owner: string, repo: string, skillPath: string): string {
  return `https://github.com/${owner}/${repo}.git#path:${skillPath}`
}

async function addSingleSkill(
  cwd: string,
  specifier: string,
): Promise<{ skillName: string; specifier: string }> {
  let normalized
  try {
    normalized = normalizeSpecifier(specifier)
  } catch (error) {
    if (error instanceof ParseError) {
      throw error
    }
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: `Invalid specifier: ${(error as Error).message}`,
      content: specifier,
      cause: error as Error,
    })
  }

  const existingManifest = (await readSkillsManifest(cwd)) ?? {
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {},
  }

  const existing = existingManifest.skills[normalized.skillName]
  if (existing && existing !== normalized.normalized) {
    throw new SkillError({
      code: ErrorCode.SKILL_EXISTS,
      skillName: normalized.skillName,
      message: `Skill ${normalized.skillName} already exists with a different specifier`,
    })
  }

  existingManifest.skills[normalized.skillName] = normalized.normalized
  await writeSkillsManifest(cwd, existingManifest)

  const existingLock = await readSkillsLock(cwd)
  const lockfile = await syncSkillsLock(cwd, existingManifest, existingLock)
  await writeSkillsLock(cwd, lockfile)

  return {
    skillName: normalized.skillName,
    specifier: normalized.normalized,
  }
}

export async function addCommand(options: AddCommandOptions) {
  const { cwd, specifier, skill } = options

  // Try owner/repo shorthand first
  const shorthand = parseOwnerRepo(specifier)
  // Try GitHub URL (https://github.com/owner/repo)
  const githubUrl = !shorthand ? parseGitHubUrl(specifier) : null
  const parsed = shorthand ?? githubUrl

  if (parsed) {
    const { owner, repo } = parsed
    const source = `${owner}/${repo}`

    p.intro(pc.bgCyan(pc.black(' spm ')))

    const spinner = p.spinner()

    // --skill flag provided — non-interactive, need to discover path
    if (skill) {
      spinner.start(`Cloning ${source}...`)
      const skills = await listRepoSkills(owner, repo)
      spinner.stop(`Found ${pc.green(String(skills.length))} skill${skills.length !== 1 ? 's' : ''}`)

      const found = skills.find((s) => s.name === skill)
      const skillPath = found?.path ?? `/${skill}`
      const gitSpecifier = buildGitHubSpecifier(owner, repo, skillPath)
      const result = await addSingleSkill(cwd, gitSpecifier)
      await installSkills(cwd)
      p.outro(`Added ${pc.cyan(result.skillName)}`)
      return result
    }

    // Interactive — clone, discover, prompt
    spinner.start(`Cloning ${source}...`)
    const skills = await listRepoSkills(owner, repo)

    if (skills.length === 0) {
      spinner.stop(pc.red('No skills found'))
      p.outro(pc.red(`No valid skills found in ${source}`))
      throw new SkillError({
        code: ErrorCode.SKILL_NOT_FOUND,
        skillName: source,
        message: `No skills found in ${source}`,
      })
    }

    spinner.stop(`Found ${pc.green(String(skills.length))} skill${skills.length !== 1 ? 's' : ''}`)

    const selected = await promptSkillSelection(skills)
    const results: { skillName: string; specifier: string }[] = []

    for (const s of selected) {
      const gitSpecifier = buildGitHubSpecifier(owner, repo, s.path)
      const result = await addSingleSkill(cwd, gitSpecifier)
      results.push(result)
      p.log.success(`Added ${pc.cyan(result.skillName)}`)
    }

    await installSkills(cwd)
    p.outro('Done')
    return results.length === 1 ? results[0] : results
  }

  // Protocol specifier (file:, npm:, git URL with fragment, etc.) — direct add
  const result = await addSingleSkill(cwd, specifier)
  await installSkills(cwd)
  return result
}

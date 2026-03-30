import * as p from '@clack/prompts'
import pc from 'picocolors'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import type { AddCommandOptions } from '../config/types'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { listRepoSkills, parseOwnerRepo, parseGitHubUrl } from '../github/listSkills'
import { promptSkillSelection } from '../cli/prompt'

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
  const normalized = normalizeSpecifier(specifier)
  const existingManifest = (await readSkillsManifest(cwd)) ?? {
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {},
  }

  const existing = existingManifest.skills[normalized.skillName]
  if (existing && existing !== normalized.normalized) {
    throw new Error(`Skill ${normalized.skillName} already exists with a different specifier`)
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

    p.intro(pc.bgCyan(pc.black(' skills-pm ')))

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
      p.outro(`Added ${pc.cyan(result.skillName)}`)
      return result
    }

    // Interactive — clone, discover, prompt
    spinner.start(`Cloning ${source}...`)
    const skills = await listRepoSkills(owner, repo)

    if (skills.length === 0) {
      spinner.stop(pc.red('No skills found'))
      p.outro(pc.red(`No valid skills found in ${source}`))
      throw new Error(`No skills found in ${source}`)
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

    p.outro('Done')
    return results.length === 1 ? results[0] : results
  }

  // Protocol specifier (file:, npm:, git URL with fragment, etc.) — direct add
  return addSingleSkill(cwd, specifier)
}


import { existsSync } from 'node:fs'
import path from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import {
  getSkillsPackageManagerHome,
  listCompatibleAddAgentNames,
  resolveCompatibleAddAgentTargets,
} from '../cli/agentCompatibility'
import { promptSkillSelection } from '../cli/prompt'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { AddCommandOptions, NormalizedSpecifier } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { ErrorCode, ParseError, SkillError } from '../errors'
import { cloneAndDiscover, discoverSkillsInDir, parseGitHubUrl } from '../github/listSkills'
import type { SkillInfo } from '../github/types'
import { installSkills } from '../install/installSkills'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { ensureDir } from '../utils/fs'

type ParsedAddSource =
  | {
      type: 'repo'
      cloneUrl: string
      displaySource: string
      ref?: string
      subpath?: string
    }
  | {
      type: 'local'
      localPath: string
      displaySource: string
      subpath?: string
    }

type ExtractedAddSource = {
  source: string
  ref?: string
  skill?: string
}

function buildGitSpecifier(repoUrl: string, skillPath: string, ref?: string): string {
  return ref ? `${repoUrl}#${ref}&path:${skillPath}` : `${repoUrl}#path:${skillPath}`
}

function buildLinkSpecifier(sourceRoot: string, skillPath: string): string {
  const absoluteSkillPath = path.join(sourceRoot, skillPath.replace(/^\//, ''))
  return `link:${absoluteSkillPath}`
}

function isDirectSkillSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('link:') ||
    specifier.startsWith('file:') ||
    specifier.startsWith('npm:') ||
    specifier.includes('#path:') ||
    specifier.includes('&path:')
  )
}

function isLocalPathSpecifier(specifier: string): boolean {
  return (
    path.isAbsolute(specifier) ||
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier === '.' ||
    specifier === '..' ||
    /^[a-zA-Z]:[/\\]/.test(specifier)
  )
}

function sanitizeSourceSubpath(subpath: string): string {
  const normalizedSubpath = subpath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')

  if (!normalizedSubpath) {
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: 'Invalid add source: subpath cannot be empty',
      content: subpath,
    })
  }

  if (normalizedSubpath.split('/').some((segment) => segment === '..')) {
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: `Invalid add source: unsafe subpath "${subpath}"`,
      content: subpath,
    })
  }

  return normalizedSubpath
}

function formatSourceWithRef(source: string, ref?: string): string {
  return ref ? `${source}#${ref}` : source
}

function parseTreeUrlSuffix(
  provider: 'GitHub' | 'GitLab',
  input: string,
  treeSuffix: string,
  ref?: string,
): { ref: string; subpath?: string } {
  const normalizedTreeSuffix = treeSuffix.replace(/\/+$/, '')

  if (ref) {
    if (normalizedTreeSuffix === ref) {
      return { ref }
    }

    if (normalizedTreeSuffix.startsWith(`${ref}/`)) {
      return {
        ref,
        subpath: sanitizeSourceSubpath(normalizedTreeSuffix.slice(ref.length + 1)),
      }
    }

    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: `${provider} tree URL does not match explicit ref "${ref}": ${input}`,
      content: input,
    })
  }

  if (normalizedTreeSuffix.includes('/')) {
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message:
        provider === 'GitHub'
          ? `Ambiguous GitHub tree URL: ${input}. If the ref contains "/", specify it explicitly with "#<ref>" instead.`
          : `Ambiguous GitLab tree URL: ${input}. GitLab refs can contain slashes, so provide the ref explicitly via #<ref>.`,
      content: input,
    })
  }

  return { ref: normalizedTreeSuffix }
}

function parseGitHubTreeSource(input: string, ref?: string): ParsedAddSource | null {
  const treeMatch = input.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/tree\/(.+?)\/?$/,
  )

  if (!treeMatch) {
    return null
  }

  const [, owner, repo, treeSuffix] = treeMatch
  const cleanRepo = repo.replace(/\.git$/, '')
  const parsedTree = parseTreeUrlSuffix('GitHub', input, treeSuffix, ref)
  return {
    type: 'repo',
    cloneUrl: `https://github.com/${owner}/${cleanRepo}.git`,
    displaySource: `${owner}/${cleanRepo}`,
    ref: parsedTree.ref,
    ...(parsedTree.subpath ? { subpath: parsedTree.subpath } : {}),
  }
}

function parseGitLabSource(input: string, ref?: string): ParsedAddSource | null {
  const treeMatch = input.match(/^(https?):\/\/([^/]+)\/(.+?)\/-\/tree\/(.+?)\/?$/)
  if (treeMatch) {
    const [, protocol, hostname, repoPath, treeSuffix] = treeMatch
    if (hostname === 'github.com') {
      return null
    }

    const cleanRepoPath = repoPath.replace(/\.git$/, '')
    const parsedTree = parseTreeUrlSuffix('GitLab', input, treeSuffix, ref)
    return {
      type: 'repo',
      cloneUrl: `${protocol}://${hostname}/${cleanRepoPath}.git`,
      displaySource: cleanRepoPath,
      ref: parsedTree.ref,
      ...(parsedTree.subpath ? { subpath: parsedTree.subpath } : {}),
    }
  }

  const gitlabRepoMatch = input.match(/^https?:\/\/gitlab\.com\/(.+?)(?:\.git)?\/?$/)
  if (!gitlabRepoMatch) {
    return null
  }

  const repoPath = gitlabRepoMatch[1]
  if (!repoPath.includes('/')) {
    return null
  }

  const cleanRepoPath = repoPath.replace(/\.git$/, '')
  return {
    type: 'repo',
    cloneUrl: `https://gitlab.com/${cleanRepoPath}.git`,
    displaySource: cleanRepoPath,
    ...(ref ? { ref } : {}),
  }
}

function parseGitHubShorthandSource(input: string, ref?: string): ParsedAddSource | null {
  const match = input.match(/^([^/]+)\/([^/]+)(?:\/(.+?))?\/?$/)
  if (!match || input.includes(':') || input.startsWith('.') || input.startsWith('/')) {
    return null
  }

  const [, owner, repo, subpath] = match
  const cleanRepo = repo.replace(/\.git$/, '')
  return {
    type: 'repo',
    cloneUrl: `https://github.com/${owner}/${cleanRepo}.git`,
    displaySource: `${owner}/${cleanRepo}`,
    ...(ref ? { ref } : {}),
    ...(subpath ? { subpath: sanitizeSourceSubpath(subpath) } : {}),
  }
}

function parseGenericGitSource(input: string, ref?: string): ParsedAddSource | null {
  if (!/^https?:\/\/.+\.git\/?$/i.test(input) && !/^git@[^:]+:.+\.git$/.test(input)) {
    return null
  }

  return {
    type: 'repo',
    cloneUrl: input.replace(/\/$/, ''),
    displaySource: input.replace(/\/$/, ''),
    ...(ref ? { ref } : {}),
  }
}

function parseAddSourceBase(input: string, ref?: string): ParsedAddSource | null {
  if (isLocalPathSpecifier(input)) {
    const resolvedPath = path.resolve(input)
    const skillDocPath = path.join(resolvedPath, 'SKILL.md')

    if (existsSync(skillDocPath)) {
      return {
        type: 'local',
        localPath: path.dirname(resolvedPath),
        displaySource: input,
        subpath: path.basename(resolvedPath),
      }
    }

    return {
      type: 'local',
      localPath: resolvedPath,
      displaySource: input,
    }
  }

  const githubPrefixMatch = input.match(/^github:(.+)$/)
  if (githubPrefixMatch) {
    return parseAddSourceBase(githubPrefixMatch[1], ref)
  }

  const gitlabPrefixMatch = input.match(/^gitlab:(.+)$/)
  if (gitlabPrefixMatch) {
    const repoPath = gitlabPrefixMatch[1].replace(/^\/+/, '').replace(/\/+$/, '')
    if (repoPath.split('/').length < 2) {
      return null
    }

    return {
      type: 'repo',
      cloneUrl: `https://gitlab.com/${repoPath.replace(/\.git$/, '')}.git`,
      displaySource: repoPath.replace(/\.git$/, ''),
      ...(ref ? { ref } : {}),
    }
  }

  const githubTreeSource = parseGitHubTreeSource(input, ref)
  if (githubTreeSource) {
    return githubTreeSource
  }

  const githubRepo = parseGitHubUrl(input)
  if (githubRepo) {
    return {
      type: 'repo',
      cloneUrl: `https://github.com/${githubRepo.owner}/${githubRepo.repo}.git`,
      displaySource: `${githubRepo.owner}/${githubRepo.repo}`,
      ...(ref ? { ref } : {}),
    }
  }

  const gitlabSource = parseGitLabSource(input, ref)
  if (gitlabSource) {
    return gitlabSource
  }

  const githubShorthand = parseGitHubShorthandSource(input, ref)
  if (githubShorthand) {
    return githubShorthand
  }

  return parseGenericGitSource(input, ref)
}

function extractAddSource(input: string): ExtractedAddSource {
  if (isDirectSkillSpecifier(input)) {
    return { source: input }
  }

  let source = input
  let ref: string | undefined
  let skill: string | undefined

  const hashIndex = input.indexOf('#')
  if (hashIndex >= 0) {
    source = input.slice(0, hashIndex)
    const fragment = input.slice(hashIndex + 1)
    const skillSeparatorIndex = fragment.indexOf('@')

    if (skillSeparatorIndex >= 0) {
      ref = fragment.slice(0, skillSeparatorIndex) || undefined
      skill = fragment.slice(skillSeparatorIndex + 1) || undefined
    } else {
      ref = fragment || undefined
    }
  }

  if (!skill) {
    const atIndex = source.lastIndexOf('@')
    if (atIndex > 0 && atIndex < source.length - 1) {
      const nextSource = source.slice(0, atIndex)
      const nextSkill = source.slice(atIndex + 1)

      if (parseAddSourceBase(nextSource, ref)?.type === 'repo') {
        source = nextSource
        skill = nextSkill
      }
    }
  }

  return { source, ref, skill }
}

function parseRepoSkillSpecifier(input: string): { specifier: string; skill: string } | null {
  const extracted = extractAddSource(input)
  if (!extracted.skill) {
    return null
  }

  return {
    specifier: formatSourceWithRef(extracted.source, extracted.ref),
    skill: extracted.skill,
  }
}

export function normalizeAddCommandInput(specifier: string, skill?: string) {
  const parsedRepoSkill = parseRepoSkillSpecifier(specifier)
  if (!parsedRepoSkill) {
    return { specifier, skill }
  }

  return {
    specifier: parsedRepoSkill.specifier,
    skill: skill ?? parsedRepoSkill.skill,
  }
}

export function parseAddSourceSpecifier(specifier: string): ParsedAddSource | null {
  if (isDirectSkillSpecifier(specifier)) {
    return null
  }

  const extracted = extractAddSource(specifier)
  return parseAddSourceBase(extracted.source, extracted.ref)
}

function normalizeRequestedSkill(requestedSkill: string): string {
  return requestedSkill.replace(/^\/+/, '').replace(/\/+$/, '')
}

function findRequestedSkill(skills: SkillInfo[], requestedSkill: string): SkillInfo | null {
  const normalizedRequestedSkill = normalizeRequestedSkill(requestedSkill)

  return (
    skills.find(
      (candidate) =>
        candidate.name === requestedSkill ||
        normalizeRequestedSkill(candidate.path) === normalizedRequestedSkill,
    ) ?? null
  )
}

function formatAvailableSkills(skills: SkillInfo[]): string {
  const preview = skills
    .slice(0, 10)
    .map((candidate) => `${candidate.name} (${candidate.path})`)
    .join(', ')

  if (skills.length <= 10) {
    return preview
  }

  return `${preview}, ...`
}

function filterSkillsBySubpath(skills: SkillInfo[], subpath?: string): SkillInfo[] {
  if (!subpath) {
    return skills
  }

  const normalizedSubpath = normalizeRequestedSkill(subpath)
  return skills.filter((candidate) => {
    const candidatePath = normalizeRequestedSkill(candidate.path)
    return candidatePath === normalizedSubpath || candidatePath.startsWith(`${normalizedSubpath}/`)
  })
}

async function discoverSkillsFromSource(source: ParsedAddSource): Promise<SkillInfo[]> {
  if (source.type === 'local') {
    if (!existsSync(source.localPath)) {
      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message: `Local path does not exist: ${source.localPath}`,
        content: source.displaySource,
      })
    }

    const skills = await discoverSkillsInDir(source.localPath)
    return filterSkillsBySubpath(skills, source.subpath)
  }

  const { skills, cleanup } = await cloneAndDiscover(source.cloneUrl, source.ref)
  await cleanup()
  return filterSkillsBySubpath(skills, source.subpath)
}

async function addSingleSkill(
  cwd: string,
  specifier: string,
  manifestDefaults?: { installDir: string; linkTargets: string[] },
): Promise<{ skillName: string; specifier: string }> {
  let normalized: NormalizedSpecifier
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

  await ensureDir(cwd)

  const existingManifest = (await readSkillsManifest(cwd)) ?? {
    installDir: manifestDefaults?.installDir ?? '.agents/skills',
    linkTargets: manifestDefaults?.linkTargets ?? [],
    skills: {},
  }

  if (manifestDefaults) {
    existingManifest.installDir = manifestDefaults.installDir
    existingManifest.linkTargets = manifestDefaults.linkTargets
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

function normalizeStringArray(values: string[] | string | undefined): string[] | undefined {
  if (values === undefined) {
    return undefined
  }

  const arrayValues = Array.isArray(values) ? values : [values]
  const normalizedValues = arrayValues.map((value) => value.trim()).filter(Boolean)
  return normalizedValues.length > 0 ? normalizedValues : undefined
}

function mergeUnique(existing: string[] | undefined, next: string[] | undefined): string[] {
  return [...new Set([...(existing ?? []), ...(next ?? [])])]
}

async function resolveAddManifestContext(options: AddCommandOptions): Promise<{
  cwd: string
  installDir: string
  linkTargets: string[]
}> {
  const targetCwd = options.global ? getSkillsPackageManagerHome() : options.cwd
  const existingManifest = await readSkillsManifest(targetCwd)
  const installDir = existingManifest?.installDir ?? '.agents/skills'
  const requestedAgents = normalizeStringArray(options.agent)

  if (requestedAgents) {
    const resolvedTargets = resolveCompatibleAddAgentTargets(requestedAgents, {
      global: options.global === true,
      installDir,
    })

    if (resolvedTargets.invalidAgents.length > 0) {
      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message: `Invalid agents: ${resolvedTargets.invalidAgents.join(', ')}. Valid agents: ${listCompatibleAddAgentNames().join(', ')}`,
        content: requestedAgents.join(', '),
      })
    }

    return {
      cwd: targetCwd,
      installDir,
      linkTargets: mergeUnique(existingManifest?.linkTargets, resolvedTargets.linkTargets),
    }
  }

  if (
    options.global &&
    !(existingManifest?.linkTargets && existingManifest.linkTargets.length > 0)
  ) {
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message:
        'Global add requires at least one --agent on first use so skills-package-manager knows which global agent directories to link into',
      content: options.specifier,
    })
  }

  return {
    cwd: targetCwd,
    installDir,
    linkTargets: existingManifest?.linkTargets ?? [],
  }
}

export async function addCommand(options: AddCommandOptions) {
  const manifestContext = await resolveAddManifestContext(options)
  const { cwd } = manifestContext
  const normalizedInput = normalizeAddCommandInput(options.specifier, options.skill)
  const { specifier, skill } = normalizedInput
  const parsedSource = parseAddSourceSpecifier(specifier)

  if (parsedSource) {
    p.intro(pc.bgCyan(pc.black(' spm ')))

    const spinner = p.spinner()
    const sourceLabel = parsedSource.displaySource

    if (parsedSource.type === 'repo') {
      spinner.start(`Cloning ${sourceLabel}...`)
    } else {
      spinner.start(`Scanning ${sourceLabel}...`)
    }

    const discoveredSkills = await discoverSkillsFromSource(parsedSource)

    if (discoveredSkills.length === 0) {
      spinner.stop(pc.red('No skills found'))
      throw new SkillError({
        code: ErrorCode.SKILL_NOT_FOUND,
        skillName: skill ?? sourceLabel,
        message: `No valid skills found in ${sourceLabel}`,
      })
    }

    spinner.stop(
      `Found ${pc.green(String(discoveredSkills.length))} skill${discoveredSkills.length !== 1 ? 's' : ''}`,
    )

    let selectedSkills: SkillInfo[]
    if (skill === '*') {
      selectedSkills = discoveredSkills
    } else if (skill) {
      const found = findRequestedSkill(discoveredSkills, skill)
      if (!found) {
        throw new SkillError({
          code: ErrorCode.SKILL_NOT_FOUND,
          skillName: skill,
          message: `Skill ${skill} not found in ${sourceLabel}. Available skills: ${formatAvailableSkills(discoveredSkills)}`,
        })
      }

      selectedSkills = [found]
    } else if (options.yes) {
      selectedSkills = discoveredSkills
    } else {
      selectedSkills = await promptSkillSelection(discoveredSkills)
    }

    const results: { skillName: string; specifier: string }[] = []
    for (const selectedSkill of selectedSkills) {
      const nextSpecifier =
        parsedSource.type === 'repo'
          ? buildGitSpecifier(parsedSource.cloneUrl, selectedSkill.path, parsedSource.ref)
          : buildLinkSpecifier(parsedSource.localPath, selectedSkill.path)
      const result = await addSingleSkill(cwd, nextSpecifier, manifestContext)
      results.push(result)
      if (selectedSkills.length > 1) {
        p.log.success(`Added ${pc.cyan(result.skillName)}`)
      }
    }

    spinner.start('Installing skills...')
    await installSkills(cwd)
    spinner.stop('Installed skills')

    if (results.length === 1) {
      p.outro(`Added ${pc.cyan(results[0].skillName)}`)
      return results[0]
    }

    p.outro('Done')
    return results
  }

  // Protocol specifier (file:, npm:, git URL with fragment, etc.) — direct add
  const result = await addSingleSkill(cwd, specifier, manifestContext)
  const spinner = p.spinner()
  spinner.start('Installing skills...')
  await installSkills(cwd)
  spinner.stop('Installed skills')
  return result
}

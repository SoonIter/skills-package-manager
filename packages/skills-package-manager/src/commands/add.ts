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
import { readSkillsManifest } from '../config/readSkillsManifest'
import { resolveSkillEntry, resolveSkillsPlan } from '../config/resolveSkillsPlan'
import type { AddCommandOptions, NormalizedSpecifier, ResolvedSkillEntry } from '../config/types'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { ErrorCode, ParseError, SkillError } from '../errors'
import { cloneAndDiscover, discoverSkillsInDir, parseGitHubUrl } from '../github/listSkills'
import type { SkillInfo } from '../github/types'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'
import { normalizeLinkSource } from '../specifiers/normalizeLinkSource'
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

const AMBIGUOUS_TREE_REF_PREFIXES = new Set([
  'bugfix',
  'chore',
  'dependabot',
  'feat',
  'feature',
  'fix',
  'hotfix',
  'release',
  'renovate',
])

function buildGitSpecifier(repoUrl: string, skillPath: string, ref?: string): string {
  return ref ? `${repoUrl}#${ref}&path:${skillPath}` : `${repoUrl}&path:${skillPath}`
}

async function runInstallPipeline(cwd: string) {
  const ctx = await loadConfig(cwd)
  const plan = await resolveSkillsPlan(cwd, ctx.manifest)
  await runPipeline({ ctx, plan, skipResolve: true })
}

function buildLinkSpecifier(sourceRoot: string, skillPath: string): string {
  const absoluteSkillPath = path.join(sourceRoot, skillPath.replace(/^\//, ''))
  return normalizeLinkSource(`link:${absoluteSkillPath}`)
}

function isDirectSkillSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith('link:') ||
    specifier.startsWith('local:') ||
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

  const [treeRef, ...subpathParts] = normalizedTreeSuffix.split('/')
  if (subpathParts.length > 0) {
    if (AMBIGUOUS_TREE_REF_PREFIXES.has(treeRef)) {
      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message: `${provider} tree URL may contain a slash-delimited ref: ${input}. Append an explicit "#<ref>" suffix.`,
        content: input,
      })
    }

    return {
      ref: treeRef,
      subpath: sanitizeSourceSubpath(subpathParts.join('/')),
    }
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

export function normalizeAddCommandInput(specifier: string, skill?: string | string[]) {
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

function printAvailableSkills(skills: SkillInfo[]) {
  for (const skill of skills) {
    const details = skill.description ? ` - ${skill.description}` : ''
    console.info(`${skill.name}\t${skill.path}${details}`)
  }
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

function selectRequestedSkills(skills: SkillInfo[], requestedSkills: string[]): SkillInfo[] {
  if (requestedSkills.includes('*')) {
    return skills
  }

  const selectedSkills: SkillInfo[] = []
  const selectedKeys = new Set<string>()

  for (const requestedSkill of requestedSkills) {
    const found = findRequestedSkill(skills, requestedSkill)
    if (!found) {
      throw new SkillError({
        code: ErrorCode.SKILL_NOT_FOUND,
        skillName: requestedSkill,
        message: `Skill ${requestedSkill} not found in source. Available skills: ${formatAvailableSkills(skills)}`,
      })
    }

    const key = `${found.name}\0${found.path}`
    if (!selectedKeys.has(key)) {
      selectedKeys.add(key)
      selectedSkills.push(found)
    }
  }

  return selectedSkills
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

async function discoverSkillsWithSpinner(
  source: ParsedAddSource,
  requestedSkills: string[] | undefined,
): Promise<SkillInfo[]> {
  p.intro(pc.bgCyan(pc.black(' spm ')))

  const spinner = p.spinner()
  const sourceLabel = source.displaySource

  if (source.type === 'repo') {
    spinner.start(`Cloning ${sourceLabel}...`)
  } else {
    spinner.start(`Scanning ${sourceLabel}...`)
  }

  let discoveredSkills: SkillInfo[]
  try {
    discoveredSkills = await discoverSkillsFromSource(source)
  } catch (error) {
    spinner.stop(pc.red('Failed to discover skills'))
    throw error
  }

  if (discoveredSkills.length === 0) {
    spinner.stop(pc.red('No skills found'))
    throw new SkillError({
      code: ErrorCode.SKILL_NOT_FOUND,
      skillName: requestedSkills?.[0] ?? sourceLabel,
      message: `No valid skills found in ${sourceLabel}`,
    })
  }

  spinner.stop(
    `Found ${pc.green(String(discoveredSkills.length))} skill${discoveredSkills.length !== 1 ? 's' : ''}`,
  )

  return discoveredSkills
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

function formatResolvedManifestSpecifier(
  normalized: NormalizedSpecifier,
  entry: ResolvedSkillEntry,
  originalSpecifier: string,
): string {
  if (originalSpecifier === 'local:*') {
    return originalSpecifier
  }

  switch (entry.resolution.type) {
    case 'git':
      return `${toGitHubSpecifierSource(entry.resolution.url)}#${entry.resolution.commit}${formatPathSuffix(entry.resolution.path)}`
    case 'npm':
      return `npm:${entry.resolution.packageName}@${entry.resolution.version}${formatPathSuffix(entry.resolution.path)}`
    case 'file':
    case 'link':
    case 'local':
      return normalized.normalized
    default: {
      const _exhaustive: never = entry.resolution
      throw new Error(`Unsupported resolution type: ${_exhaustive}`)
    }
  }
}

async function addSingleSkill(
  cwd: string,
  specifier: string,
  manifestDefaults?: { installDir: string; linkTargets: string[] },
  skillName?: string,
): Promise<{ skillName: string; specifier: string }> {
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

  let normalized: NormalizedSpecifier
  try {
    normalized = normalizeSpecifier(specifier, {
      installDir: existingManifest.installDir,
      skillName,
    })
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

  const { entry } = await resolveSkillEntry(cwd, specifier, normalized.skillName, {
    installDir: existingManifest.installDir,
  })
  const manifestSpecifier = formatResolvedManifestSpecifier(normalized, entry, specifier)

  const existing = existingManifest.skills[normalized.skillName]
  if (existing && existing !== manifestSpecifier) {
    throw new SkillError({
      code: ErrorCode.SKILL_EXISTS,
      skillName: normalized.skillName,
      message: `Skill ${normalized.skillName} already exists with a different specifier`,
    })
  }

  existingManifest.skills[normalized.skillName] = manifestSpecifier
  await writeSkillsManifest(cwd, existingManifest)

  return {
    skillName: normalized.skillName,
    specifier: manifestSpecifier,
  }
}

function getDirectAddSkillName(
  specifier: string,
  requestedSkills: string[] | undefined,
): string | undefined {
  if (!requestedSkills || requestedSkills.length === 0 || requestedSkills.includes('*')) {
    if (specifier === 'local:*') {
      throw new ParseError({
        code: ErrorCode.INVALID_SPECIFIER,
        message:
          'local:* add requires --skill <name> so the existing installDir skill can be resolved',
        content: specifier,
      })
    }

    return undefined
  }

  if (requestedSkills.length > 1) {
    throw new ParseError({
      code: ErrorCode.INVALID_SPECIFIER,
      message: 'Direct specifier add accepts at most one --skill value',
      content: requestedSkills.join(', '),
    })
  }

  return requestedSkills[0]
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
  const requestedAgents = options.all ? ['*'] : normalizeStringArray(options.agent)

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
  const normalizedInput = normalizeAddCommandInput(options.specifier, options.skill)
  const { specifier, skill } = normalizedInput
  const parsedSource = parseAddSourceSpecifier(specifier)
  const requestedSkills = options.all ? ['*'] : normalizeStringArray(skill)

  if (options.list) {
    if (parsedSource) {
      const discoveredSkills = await discoverSkillsWithSpinner(parsedSource, requestedSkills)
      printAvailableSkills(discoveredSkills)
      p.outro('Listed skills')
      return { status: 'listed' as const, skills: discoveredSkills }
    }

    const existingManifest = await readSkillsManifest(options.cwd)
    const normalized = normalizeSpecifier(specifier, {
      installDir: existingManifest?.installDir ?? '.agents/skills',
      skillName: getDirectAddSkillName(specifier, requestedSkills),
    })
    const listedSkill = {
      name: normalized.skillName,
      description: '',
      path: normalized.path,
    }
    printAvailableSkills([listedSkill])
    return { status: 'listed' as const, skills: [listedSkill] }
  }

  const manifestContext = await resolveAddManifestContext(options)
  const { cwd } = manifestContext

  if (parsedSource) {
    const discoveredSkills = await discoverSkillsWithSpinner(parsedSource, requestedSkills)

    let selectedSkills: SkillInfo[]
    if (requestedSkills && requestedSkills.length > 0) {
      selectedSkills = selectRequestedSkills(discoveredSkills, requestedSkills)
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
      const result = await addSingleSkill(cwd, nextSpecifier, manifestContext, selectedSkill.name)
      results.push(result)
      if (selectedSkills.length > 1) {
        p.log.success(`Added ${pc.cyan(result.skillName)}`)
      }
    }

    const spinner = p.spinner()
    spinner.start('Installing skills...')
    await runInstallPipeline(cwd)
    spinner.stop('Installed skills')

    if (results.length === 1) {
      p.outro(`Added ${pc.cyan(results[0].skillName)}`)
      return results[0]
    }

    p.outro('Done')
    return results
  }

  // Protocol specifier (file:, npm:, git URL with fragment, etc.) — direct add
  const result = await addSingleSkill(
    cwd,
    specifier,
    manifestContext,
    getDirectAddSkillName(specifier, requestedSkills),
  )
  const spinner = p.spinner()
  spinner.start('Installing skills...')
  await runInstallPipeline(cwd)
  spinner.stop('Installed skills')
  return result
}

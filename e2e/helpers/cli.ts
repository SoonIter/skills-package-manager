import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const repoRoot = path.resolve(__dirname, '../..')
export const spmBin = path.join(repoRoot, 'packages/skills-package-manager/bin/spm.js')

type CliResult = {
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

type Replacement = {
  value: string
  placeholder: string
}

type RunSpmOptions = {
  cwd: string
  env?: NodeJS.ProcessEnv
}

type TerminalSnapshotOptions = {
  replacements?: Replacement[]
}

const packageJson = JSON.parse(
  readFileSync(path.join(repoRoot, 'packages/skills-package-manager/package.json'), 'utf8'),
) as { version: string }

const spmProcessTimeoutMs = 55_000

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replacementVariants(value: string): string[] {
  const normalized = path.resolve(value)
  const realPath = existsSync(value) ? realpathSync(value) : null
  return [
    ...new Set(
      [value, normalized, realPath]
        .filter((variant): variant is string => Boolean(variant))
        .flatMap((variant) => [variant, variant.replace(/\\/g, '/')]),
    ),
  ].sort((left, right) => right.length - left.length)
}

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')

function stripAnsi(value: string): string {
  return value.replace(ansiPattern, '')
}

function normalizeTerminalText(value: string, replacements: Replacement[] = []): string {
  let normalized = stripAnsi(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  normalized = normalized.replace(/[◒◐◓◑]\s*[^◒◐◓◑◇\n]*/g, '')

  for (const replacement of [
    { value: repoRoot, placeholder: '<repo>' },
    { value: packageJson.version, placeholder: '<package-version>' },
    ...replacements,
  ]) {
    for (const variant of replacementVariants(replacement.value)) {
      normalized = normalized.replace(
        new RegExp(escapeRegExp(variant), 'g'),
        replacement.placeholder,
      )
    }
  }

  return normalized.trimEnd()
}

function indentBlock(value: string): string {
  if (!value) {
    return '  <empty>'
  }

  return value
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

export function runSpm(args: string[], options: RunSpmOptions): CliResult {
  const homeDir = path.join(options.cwd, '.e2e-home')

  mkdirSync(homeDir, { recursive: true })

  const result = spawnSync(process.execPath, [spmBin, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      CI: '1',
      FORCE_COLOR: '0',
      GIT_TERMINAL_PROMPT: '0',
      NO_COLOR: '1',
      SKILLS_PACKAGE_MANAGER_HOME: path.join(homeDir, '.skills-package-manager'),
      TERM: 'dumb',
      ...options.env,
    },
    encoding: 'utf8',
    timeout: spmProcessTimeoutMs,
  })

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

export function formatTerminalSnapshot(
  result: CliResult,
  options: TerminalSnapshotOptions = {},
): string {
  const stdout = normalizeTerminalText(result.stdout, options.replacements)
  const stderr = normalizeTerminalText(result.stderr, options.replacements)

  return [
    `status: ${result.status}`,
    `signal: ${result.signal ?? '<none>'}`,
    'stdout:',
    indentBlock(stdout),
    'stderr:',
    indentBlock(stderr),
  ].join('\n')
}

export function formatProjectTerminalSnapshot(
  result: CliResult,
  project: string,
  replacements: Replacement[] = [],
): string {
  return formatTerminalSnapshot(result, {
    replacements: [{ value: project, placeholder: '<project>' }, ...replacements],
  })
}

export function createTempProject(name: string): string {
  return mkdtempSync(path.join(tmpdir(), `skills-pm-e2e-${name}-`))
}

export function cleanupTempProject(root: string): void {
  rmSync(root, { recursive: true, force: true })
}

export function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T
}

export function createSkillDir(parentDir: string, skillName: string, description?: string): string {
  const skillDir = path.join(parentDir, skillName)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    [
      '---',
      `name: ${skillName}`,
      `description: ${description ?? `Test ${skillName}`}`,
      '---',
      '',
      `# ${skillName}`,
      '',
      'Instructions for this test skill.',
      '',
    ].join('\n'),
  )
  return skillDir
}

export function createSkillSource(root: string, skillName: string, description?: string): string {
  const sourceRoot = path.join(root, 'skill-source')
  createSkillDir(path.join(sourceRoot, 'skills'), skillName, description)
  return sourceRoot
}

export function pathExists(filePath: string): boolean {
  return existsSync(filePath)
}

export function isSymlink(filePath: string): boolean {
  return lstatSync(filePath).isSymbolicLink()
}

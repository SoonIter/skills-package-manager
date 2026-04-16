import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import type { SkillInfo } from './types'

const execFileAsync = promisify(execFile)

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__'])
const ALLOWED_HIDDEN_DIRS = new Set(['.agents', '.claude', '.github'])

function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) {
    return { name: '', description: '' }
  }

  const fm = fmMatch[1]
  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  const descMatch = fm.match(/^description:\s*(.+)$/m)

  return {
    name: nameMatch?.[1]?.trim() ?? '',
    description: descMatch?.[1]?.trim() ?? '',
  }
}

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const s = await stat(join(dir, 'SKILL.md'))
    return s.isFile()
  } catch {
    return false
  }
}

async function parseSkillDir(dir: string, relativePath: string): Promise<SkillInfo | null> {
  try {
    const content = await readFile(join(dir, 'SKILL.md'), 'utf8')
    const meta = parseSkillFrontmatter(content)
    const dirName = basename(dir)
    return {
      name: meta.name || dirName,
      description: meta.description,
      path: relativePath,
    }
  } catch {
    return null
  }
}

function shouldSkipDir(name: string): boolean {
  if (SKIP_DIRS.has(name)) {
    return true
  }

  return name.startsWith('.') && !ALLOWED_HIDDEN_DIRS.has(name)
}

async function scanForSkillsRecursive(baseDir: string, subDir = ''): Promise<SkillInfo[]> {
  const searchDir = subDir ? join(baseDir, subDir) : baseDir

  try {
    const entries = await readdir(searchDir, { withFileTypes: true })
    const dirs = entries.filter((entry) => entry.isDirectory() && !shouldSkipDir(entry.name))

    const results = await Promise.all(
      dirs.map(async (entry) => {
        const relativePath = subDir ? `${subDir}/${entry.name}` : entry.name
        const fullPath = join(searchDir, entry.name)

        if (await hasSkillMd(fullPath)) {
          const parsed = await parseSkillDir(fullPath, `/${relativePath}`)
          return parsed ? [parsed] : []
        }

        return scanForSkillsRecursive(baseDir, relativePath)
      }),
    )

    return results.flat()
  } catch {
    return []
  }
}

/**
 * Clone a git repo (shallow) into a temp dir, discover skills, then clean up.
 */
export async function cloneAndDiscover(
  gitUrl: string,
  ref?: string,
): Promise<{ skills: SkillInfo[]; cleanup: () => Promise<void> }> {
  const tempDir = await mkdtemp(join(tmpdir(), 'skills-pm-discover-'))

  try {
    const cloneArgs = ref
      ? ['clone', '--depth', '1', '--branch', ref, gitUrl, tempDir]
      : ['clone', '--depth', '1', gitUrl, tempDir]

    await execFileAsync('git', cloneArgs, {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      timeout: 60_000,
    })

    const skills = await discoverSkillsInDir(tempDir)

    return {
      skills,
      cleanup: async () => {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {})
      },
    }
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

/**
 * Discover skills in a local directory by scanning for SKILL.md files.
 * Recursively scans the repo tree for directories containing SKILL.md.
 */
export async function discoverSkillsInDir(baseDir: string): Promise<SkillInfo[]> {
  const skills = await scanForSkillsRecursive(baseDir)
  skills.sort((a, b) => a.path.localeCompare(b.path) || a.name.localeCompare(b.name))
  return skills
}

/**
 * List skills in a GitHub repo by cloning and scanning.
 * This avoids GitHub API rate limits.
 */
export async function listRepoSkills(
  owner: string,
  repo: string,
  ref?: string,
): Promise<SkillInfo[]> {
  const gitUrl = `https://github.com/${owner}/${repo}.git`
  const { skills, cleanup } = await cloneAndDiscover(gitUrl, ref)
  await cleanup()
  return skills
}

export function parseOwnerRepo(input: string): { owner: string; repo: string } | null {
  const match = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/)
  if (!match) {
    return null
  }
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') }
}

export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const match = input.match(
    /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/,
  )
  if (!match) {
    return null
  }
  return { owner: match[1], repo: match[2] }
}

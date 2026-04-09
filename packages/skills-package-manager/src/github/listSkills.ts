import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createGitWorktree } from '../cache/git'
import type { SkillInfo } from './types'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__'])

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

/**
 * Scan a directory for subdirs containing SKILL.md.
 * Returns skills found in that directory level.
 */
async function scanForSkills(baseDir: string, subDir: string): Promise<SkillInfo[]> {
  const searchDir = subDir ? join(baseDir, subDir) : baseDir
  const skills: SkillInfo[] = []

  try {
    const entries = await readdir(searchDir, { withFileTypes: true })
    const dirs = entries.filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))

    const checks = dirs.map(async (entry) => {
      const fullPath = join(searchDir, entry.name)
      if (await hasSkillMd(fullPath)) {
        const relativePath = subDir ? `/${subDir}/${entry.name}` : `/${entry.name}`
        return parseSkillDir(fullPath, relativePath)
      }
      return null
    })

    const results = await Promise.all(checks)
    for (const r of results) {
      if (r) skills.push(r)
    }
  } catch {
    // directory doesn't exist
  }

  return skills
}

/**
 * Clone a git repo (shallow) into a temp dir, discover skills, then clean up.
 */
export async function cloneAndDiscover(
  gitUrl: string,
  ref?: string,
): Promise<{ skills: SkillInfo[]; cleanup: () => Promise<void> }> {
  const { worktreePath, cleanup } = await createGitWorktree(gitUrl, ref ?? null)

  try {
    const skills = await discoverSkillsInDir(worktreePath)
    return { skills, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}

/**
 * Discover skills in a local directory by scanning for SKILL.md files.
 * Checks root-level dirs first, then common subdirs (skills/, .agents/skills/, etc.)
 */
export async function discoverSkillsInDir(baseDir: string): Promise<SkillInfo[]> {
  // Scan root directory first
  const rootSkills = await scanForSkills(baseDir, '')
  if (rootSkills.length > 0) {
    rootSkills.sort((a, b) => a.name.localeCompare(b.name))
    return rootSkills
  }

  // Try common skill directories
  const commonDirs = ['skills', '.agents/skills', '.claude/skills', '.github/skills']

  for (const dir of commonDirs) {
    const skills = await scanForSkills(baseDir, dir)
    if (skills.length > 0) {
      skills.sort((a, b) => a.name.localeCompare(b.name))
      return skills
    }
  }

  return []
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
  return { owner: match[1], repo: match[2] }
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

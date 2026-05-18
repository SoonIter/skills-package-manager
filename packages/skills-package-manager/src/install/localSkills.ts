import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedSkillsPlan, ResolvedSkillEntry } from '../config/types'

export function getLocalSkillDirs(
  rootDir: string,
  plans: Array<ResolvedSkillsPlan | null | undefined>,
) {
  const dirs: string[] = []

  for (const plan of plans) {
    if (!plan) {
      continue
    }

    for (const entry of Object.values(plan.skills)) {
      if (entry.resolution.type === 'local') {
        dirs.push(path.resolve(rootDir, entry.resolution.path))
      }
    }
  }

  return Array.from(new Set(dirs))
}

export function getSkillInstallPath(
  rootDir: string,
  installDir: string,
  skillName: string,
  entry: ResolvedSkillEntry,
) {
  return entry.resolution.type === 'local'
    ? path.resolve(rootDir, entry.resolution.path)
    : path.join(rootDir, installDir, skillName)
}

function toRepoRelativePath(rootDir: string, absolutePath: string): string | null {
  const relativePath = path.relative(rootDir, absolutePath)
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null
  }

  return relativePath.split(path.sep).join('/')
}

function createUnignoreRules(relativePath: string): string[] {
  const parts = relativePath.split('/').filter(Boolean)
  const rules: string[] = []

  for (let index = 0; index < parts.length; index += 1) {
    rules.push(`!${parts.slice(0, index + 1).join('/')}/`)
  }
  rules.push(`!${relativePath}/**`)

  return rules
}

export async function ensureLocalSkillGitignoreRules(rootDir: string, plan: ResolvedSkillsPlan) {
  const desiredRules = new Set<string>()
  for (const dir of getLocalSkillDirs(rootDir, [plan])) {
    const relativePath = toRepoRelativePath(rootDir, dir)
    if (!relativePath) {
      continue
    }

    for (const rule of createUnignoreRules(relativePath)) {
      desiredRules.add(rule)
    }
  }

  if (desiredRules.size === 0) {
    return
  }

  const gitignorePath = path.join(rootDir, '.gitignore')
  let existing = ''
  try {
    existing = await readFile(gitignorePath, 'utf8')
  } catch {
    // Create .gitignore when a repo-local local: skill needs unignore rules.
  }

  const existingRules = new Set(existing.split(/\r?\n/).map((line) => line.trim()))
  const missingRules = Array.from(desiredRules).filter((rule) => !existingRules.has(rule))
  if (missingRules.length === 0) {
    return
  }

  const prefix = existing && !existing.endsWith('\n') ? '\n' : ''
  const separator = existing.trim() ? '\n' : ''
  await writeFile(
    gitignorePath,
    `${existing}${prefix}${separator}# Keep local skills tracked\n${missingRules.join('\n')}\n`,
    'utf8',
  )
}

import type { SkillsLock, SkillsLockEntry, SkillsManifest } from './types'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { sha256 } from '../utils/hash'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function resolveGitCommitByLsRemote(url: string, target: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['ls-remote', url, target, `${target}^{}`])
    const lines = stdout
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const peeledLine = lines.find((line) => line.endsWith('^{}'))
    const resolvedLine = peeledLine ?? lines[0]
    return resolvedLine?.split('\t')[0]?.trim() || null
  } catch {
    return null
  }
}

async function resolveGitCommitByClone(url: string, target: string): Promise<string | null> {
  const checkoutRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-git-ref-'))

  try {
    await execFileAsync('git', ['clone', '--bare', '--quiet', url, checkoutRoot])
    const { stdout } = await execFileAsync('git', ['rev-parse', '--verify', `${target}^{commit}`], {
      cwd: checkoutRoot,
    })
    return stdout.trim().split('\n')[0]?.trim() || null
  } catch {
    return null
  } finally {
    await rm(checkoutRoot, { recursive: true, force: true }).catch(() => {})
  }
}

async function resolveGitCommit(url: string, ref: string | null): Promise<string> {
  const target = ref ?? 'HEAD'
  const commit = await resolveGitCommitByLsRemote(url, target)

  if (commit) {
    return commit
  }

  const clonedCommit = await resolveGitCommitByClone(url, target)

  if (clonedCommit) {
    return clonedCommit
  }

  throw new Error(`Unable to resolve git ref ${target} for ${url}`)
}

export async function resolveLockEntry(cwd: string, specifier: string): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const normalized = normalizeSpecifier(specifier)

  if (normalized.type === 'file') {
    const sourceRoot = path.resolve(cwd, normalized.source.slice('file:'.length))
    return {
      skillName: normalized.skillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'file',
          path: sourceRoot,
        },
        digest: sha256(`${sourceRoot}:${normalized.path}`),
      },
    }
  }

  if (normalized.type === 'git') {
    const commit = await resolveGitCommit(normalized.source, normalized.ref)
    return {
      skillName: normalized.skillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'git',
          url: normalized.source,
          commit,
          path: normalized.path,
        },
        digest: sha256(`${normalized.source}:${commit}:${normalized.path}`),
      },
    }
  }

  throw new Error(`Unsupported specifier type in 0.1.0 core flow: ${normalized.type}`)
}

export async function syncSkillsLock(cwd: string, manifest: SkillsManifest, existingLock: SkillsLock | null): Promise<SkillsLock> {
  const nextSkills: Record<string, SkillsLockEntry> = {}

  for (const specifier of Object.values(manifest.skills)) {
    const { skillName, entry } = await resolveLockEntry(cwd, specifier)
    nextSkills[skillName] = entry
  }

  return {
    lockfileVersion: '0.1',
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    skills: nextSkills,
  }
}

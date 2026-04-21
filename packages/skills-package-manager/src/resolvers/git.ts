import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { SkillsLockEntry } from '../config/types'
import { ErrorCode, GitError } from '../errors'
import { sha256 } from '../utils/hash'

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

export async function resolveGitCommit(url: string, ref: string | null): Promise<string> {
  const target = ref ?? 'HEAD'
  const commit = await resolveGitCommitByLsRemote(url, target)

  if (commit) {
    return commit
  }

  const clonedCommit = await resolveGitCommitByClone(url, target)

  if (clonedCommit) {
    return clonedCommit
  }

  throw new GitError({
    code: ErrorCode.GIT_REF_NOT_FOUND,
    operation: 'resolve-ref',
    repoUrl: url,
    ref: target,
    message: `Unable to resolve git ref "${target}" for ${url}`,
  })
}

export async function resolveGitEntry(
  source: string,
  ref: string | null,
  path: string,
  skillName: string,
  specifier: string,
): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const commit = await resolveGitCommit(source, ref)
  return {
    skillName,
    entry: {
      specifier,
      resolution: {
        type: 'git',
        url: source,
        commit,
        path,
      },
      digest: sha256(`${source}:${commit}:${path}`),
    },
  }
}

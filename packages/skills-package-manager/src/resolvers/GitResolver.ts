import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { ErrorCode, GitError } from '../errors'
import { LockEntry } from '../structures/LockEntry'
import { Resolution } from '../structures/Resolution'
import type { Specifier } from '../structures/Specifier'
import { sha256 } from '../utils/hash'
import type { ResolveContext, Resolver } from './Resolver'

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
  const lsRemoteCommit = await resolveGitCommitByLsRemote(url, target)
  if (lsRemoteCommit) {
    return lsRemoteCommit
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

export class GitResolver implements Resolver {
  supports(specifier: Specifier): boolean {
    return specifier.type === 'git'
  }

  async resolve(specifier: Specifier, _context: ResolveContext): Promise<LockEntry> {
    const commit = await resolveGitCommit(specifier.source, specifier.ref)
    return new LockEntry({
      specifier: specifier.normalized,
      resolution: Resolution.git(specifier.source, commit, specifier.path).toJSON(),
      digest: sha256(`${specifier.source}:${commit}:${specifier.path}`),
    })
  }
}

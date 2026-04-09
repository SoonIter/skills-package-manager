import { execFile } from 'node:child_process'
import { access, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { ErrorCode, GitError } from '../errors'
import { createCacheTempDir, getCacheKeyPath, getCachePaths, withCacheLock } from './index'

const execFileAsync = promisify(execFile)

function getGitEnv() {
  return { ...process.env, GIT_TERMINAL_PROMPT: '0' }
}

function isFullCommitHash(ref: string): boolean {
  return /^[0-9a-f]{40}$/i.test(ref)
}

function getRepoLockKey(repoUrl: string): string {
  return `git-repo:${repoUrl}`
}

async function getMirrorPath(repoUrl: string): Promise<string> {
  const cache = await getCachePaths()
  return path.join(getCacheKeyPath(cache.reposDir, repoUrl), 'mirror.git')
}

async function runGit(args: string[], options?: { cwd?: string; timeout?: number }) {
  return execFileAsync('git', args, {
    cwd: options?.cwd,
    env: getGitEnv(),
    timeout: options?.timeout ?? 60_000,
  })
}

async function ensureMirrorExists(repoUrl: string, mirrorPath: string): Promise<void> {
  try {
    await access(path.join(mirrorPath, 'HEAD'))
    return
  } catch {}

  await mkdir(path.dirname(mirrorPath), { recursive: true })

  try {
    await runGit(['clone', '--mirror', repoUrl, mirrorPath])
  } catch (error) {
    await rm(path.dirname(mirrorPath), { recursive: true, force: true }).catch(() => {})
    throw new GitError({
      code: ErrorCode.GIT_CLONE_FAILED,
      operation: 'clone',
      repoUrl,
      message: `Failed to clone repository ${repoUrl}`,
      cause: error as Error,
    })
  }
}

async function updateMirror(repoUrl: string, mirrorPath: string): Promise<void> {
  try {
    await runGit(['--git-dir', mirrorPath, 'remote', 'update', '--prune', 'origin'])
  } catch (error) {
    throw new GitError({
      code: ErrorCode.GIT_FETCH_FAILED,
      operation: 'fetch',
      repoUrl,
      message: `Failed to fetch repository ${repoUrl}`,
      cause: error as Error,
    })
  }
}

async function tryResolveCommit(mirrorPath: string, target: string): Promise<string | null> {
  try {
    const { stdout } = await runGit([
      '--git-dir',
      mirrorPath,
      'rev-parse',
      '--verify',
      `${target}^{commit}`,
    ])
    return stdout.trim().split('\n')[0]?.trim() || null
  } catch {
    return null
  }
}

async function fetchCommit(repoUrl: string, mirrorPath: string, commit: string): Promise<void> {
  try {
    await runGit(['--git-dir', mirrorPath, 'fetch', 'origin', commit])
  } catch (error) {
    throw new GitError({
      code: ErrorCode.GIT_FETCH_FAILED,
      operation: 'fetch',
      repoUrl,
      ref: commit,
      message: `Failed to fetch commit ${commit} from ${repoUrl}`,
      cause: error as Error,
    })
  }
}

export async function resolveGitCommitFromMirror(
  repoUrl: string,
  ref: string | null,
): Promise<string> {
  const target = ref ?? 'HEAD'

  return withCacheLock(getRepoLockKey(repoUrl), async () => {
    const mirrorPath = await getMirrorPath(repoUrl)
    await ensureMirrorExists(repoUrl, mirrorPath)

    if (isFullCommitHash(target)) {
      const existingCommit = await tryResolveCommit(mirrorPath, target)
      if (existingCommit) {
        return existingCommit
      }

      await fetchCommit(repoUrl, mirrorPath, target)
    } else {
      await updateMirror(repoUrl, mirrorPath)
    }

    const resolvedCommit = await tryResolveCommit(mirrorPath, target)
    if (resolvedCommit) {
      return resolvedCommit
    }

    throw new GitError({
      code: ErrorCode.GIT_REF_NOT_FOUND,
      operation: 'resolve-ref',
      repoUrl,
      ref: target,
      message: `Unable to resolve git ref "${target}" for ${repoUrl}`,
    })
  })
}

async function addWorktree(
  mirrorPath: string,
  worktreePath: string,
  target: string,
): Promise<void> {
  await runGit(['--git-dir', mirrorPath, 'worktree', 'add', '--detach', worktreePath, target])
}

async function removeWorktree(mirrorPath: string, worktreePath: string): Promise<void> {
  try {
    await runGit(['--git-dir', mirrorPath, 'worktree', 'remove', '--force', worktreePath])
  } catch {}
  await rm(worktreePath, { recursive: true, force: true }).catch(() => {})
}

export async function createGitWorktree(
  repoUrl: string,
  ref: string | null,
): Promise<{ worktreePath: string; resolvedCommit: string; cleanup: () => Promise<void> }> {
  const worktreePath = await createCacheTempDir('skills-pm-git-worktree-')
  const resolvedCommit = await resolveGitCommitFromMirror(repoUrl, ref)
  const mirrorPath = await getMirrorPath(repoUrl)

  await withCacheLock(getRepoLockKey(repoUrl), async () => {
    await addWorktree(mirrorPath, worktreePath, resolvedCommit)
  }).catch(async (error) => {
    await rm(worktreePath, { recursive: true, force: true }).catch(() => {})
    throw new GitError({
      code: ErrorCode.GIT_CHECKOUT_FAILED,
      operation: 'checkout',
      repoUrl,
      ref: resolvedCommit,
      message: `Failed to checkout commit ${resolvedCommit}`,
      cause: error as Error,
    })
  })

  return {
    worktreePath,
    resolvedCommit,
    cleanup: async () => {
      await withCacheLock(getRepoLockKey(repoUrl), async () => {
        await removeWorktree(mirrorPath, worktreePath)
      }).catch(async () => {
        await rm(worktreePath, { recursive: true, force: true }).catch(() => {})
      })
    },
  }
}

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { ErrorCode, GitError } from '../errors'
import { materializeLocalSkill } from './materializeLocalSkill'

const execFileAsync = promisify(execFile)

async function checkoutCommit(checkoutRoot: string, commit: string) {
  try {
    await execFileAsync('git', ['checkout', commit], { cwd: checkoutRoot })
  } catch (error) {
    throw new GitError({
      code: ErrorCode.GIT_CHECKOUT_FAILED,
      operation: 'checkout',
      ref: commit,
      message: `Failed to checkout commit ${commit}`,
      cause: error as Error,
    })
  }
}

async function fetchCommitFallback(checkoutRoot: string, commit: string, repoUrl?: string) {
  try {
    await execFileAsync('git', ['fetch', '--depth', '1', 'origin', commit], { cwd: checkoutRoot })
    return
  } catch {}

  try {
    await execFileAsync('git', ['fetch', '--tags', 'origin'], { cwd: checkoutRoot })
    return
  } catch {}

  try {
    await execFileAsync('git', ['fetch', '--unshallow', 'origin'], { cwd: checkoutRoot })
  } catch {
    await execFileAsync('git', ['fetch', 'origin'], { cwd: checkoutRoot })
  }
}

export async function materializeGitSkill(
  rootDir: string,
  skillName: string,
  repoUrl: string,
  commit: string,
  sourcePath: string,
  installDir: string,
) {
  const checkoutRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-git-checkout-'))

  try {
    try {
      await execFileAsync('git', ['clone', '--depth', '1', repoUrl, checkoutRoot])
    } catch (error) {
      throw new GitError({
        code: ErrorCode.GIT_CLONE_FAILED,
        operation: 'clone',
        repoUrl,
        message: `Failed to clone repository ${repoUrl}`,
        cause: error as Error,
      })
    }

    if (commit && commit !== 'HEAD') {
      try {
        await checkoutCommit(checkoutRoot, commit)
      } catch (checkoutError) {
        if (checkoutError instanceof GitError) {
          try {
            await fetchCommitFallback(checkoutRoot, commit, repoUrl)
            await checkoutCommit(checkoutRoot, commit)
          } catch {
            throw checkoutError
          }
        } else {
          throw checkoutError
        }
      }
    }

    const skillDocPath = path.join(checkoutRoot, sourcePath.replace(/^\//, ''), 'SKILL.md')
    await readFile(skillDocPath, 'utf8')

    await materializeLocalSkill(rootDir, skillName, checkoutRoot, sourcePath, installDir)
  } finally {
    await rm(checkoutRoot, { recursive: true, force: true })
  }
}

import { execFile } from 'node:child_process'
import { access, cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { SkillsLockEntry } from '../config/types'
import { convertNodeError, ErrorCode, GitError, ParseError } from '../errors'

const execFileAsync = promisify(execFile)

export const PATCH_EDIT_STATE_FILE = '.skills-pm-patch.json'

export type PatchEditState = {
  version: 1
  skillName: string
  originalSpecifier: string
  baseEntry: SkillsLockEntry
}

export async function writePatchEditState(editDir: string, state: PatchEditState) {
  const filePath = path.join(editDir, PATCH_EDIT_STATE_FILE)
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export async function readPatchEditState(editDir: string): Promise<PatchEditState> {
  const filePath = path.join(editDir, PATCH_EDIT_STATE_FILE)

  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'read', path: filePath })
  }

  try {
    return JSON.parse(raw) as PatchEditState
  } catch (error) {
    throw new ParseError({
      code: ErrorCode.JSON_PARSE_ERROR,
      filePath,
      content: raw,
      message: `Failed to parse patch edit state: ${(error as Error).message}`,
      cause: error as Error,
    })
  }
}

async function clearDirectoryExceptGit(rootDir: string) {
  const entries = await readdir(rootDir, { withFileTypes: true })
  await Promise.all(
    entries
      .filter((entry) => entry.name !== '.git')
      .map((entry) =>
        rm(path.join(rootDir, entry.name), {
          recursive: true,
          force: true,
        }),
      ),
  )
}

async function copySkillDir(from: string, to: string) {
  await cp(from, to, {
    recursive: true,
    filter: (source) => {
      const baseName = path.basename(source)
      return baseName !== PATCH_EDIT_STATE_FILE && baseName !== '.git' && baseName !== '.hg'
    },
  })
}

async function runGitCommand(
  args: string[],
  options: {
    cwd: string
    message: string
    operation: string
    maxBuffer?: number
  },
) {
  try {
    return await execFileAsync('git', args, {
      cwd: options.cwd,
      ...(options.maxBuffer ? { maxBuffer: options.maxBuffer } : {}),
    })
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      throw new GitError({
        code: ErrorCode.GIT_NOT_INSTALLED,
        operation: options.operation,
        message: 'git is required to create and apply skill patches',
        cause: error as Error,
      })
    }

    throw new GitError({
      code: ErrorCode.GIT_FETCH_FAILED,
      operation: options.operation,
      message: options.message,
      cause: error as Error,
    })
  }
}

export async function applySkillPatch(targetDir: string, patchFilePath: string) {
  try {
    await access(patchFilePath)
  } catch (error) {
    throw convertNodeError(error as NodeJS.ErrnoException, {
      operation: 'read',
      path: patchFilePath,
    })
  }

  await runGitCommand(['apply', '--whitespace=nowarn', patchFilePath], {
    cwd: targetDir,
    operation: 'apply',
    message: `Failed to apply patch ${patchFilePath}`,
  })
}

export async function generateSkillPatch(baseDir: string, editedDir: string): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-patch-commit-'))

  try {
    await runGitCommand(['init', '--quiet'], {
      cwd: repoRoot,
      operation: 'init',
      message: 'Failed to initialize git repository for patch generation',
    })
    await runGitCommand(['config', 'user.email', 'skills-package-manager@example.com'], {
      cwd: repoRoot,
      operation: 'config',
      message: 'Failed to configure git user email for patch generation',
    })
    await runGitCommand(['config', 'user.name', 'skills-package-manager'], {
      cwd: repoRoot,
      operation: 'config',
      message: 'Failed to configure git user name for patch generation',
    })

    await copySkillDir(baseDir, repoRoot)
    await runGitCommand(['add', '--all'], {
      cwd: repoRoot,
      operation: 'add',
      message: 'Failed to stage base skill files for patch generation',
    })
    await runGitCommand(['commit', '--quiet', '--allow-empty', '--no-gpg-sign', '-m', 'base'], {
      cwd: repoRoot,
      operation: 'commit',
      message: 'Failed to create base commit for patch generation',
    })

    await clearDirectoryExceptGit(repoRoot)
    await copySkillDir(editedDir, repoRoot)

    const { stdout } = await runGitCommand(
      [
        'diff',
        '--binary',
        '--full-index',
        '--no-ext-diff',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        'HEAD',
        '--',
        '.',
      ],
      {
        cwd: repoRoot,
        operation: 'diff',
        message: 'Failed to generate skill patch',
        maxBuffer: 10 * 1024 * 1024,
      },
    )

    return stdout
  } finally {
    await rm(repoRoot, { recursive: true, force: true }).catch(() => {})
  }
}

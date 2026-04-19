import { execFile } from 'node:child_process'
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { SkillsLockEntry } from '../config/types'
import { convertNodeError, ErrorCode, ParseError } from '../errors'

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
    filter: (source) => path.basename(source) !== PATCH_EDIT_STATE_FILE,
  })
}

export async function applySkillPatch(targetDir: string, patchFilePath: string) {
  try {
    await execFileAsync('git', ['apply', '--whitespace=nowarn', patchFilePath], {
      cwd: targetDir,
    })
  } catch (error) {
    throw new Error(`Failed to apply patch ${patchFilePath}: ${(error as Error).message}`, {
      cause: error as Error,
    })
  }
}

export async function generateSkillPatch(baseDir: string, editedDir: string): Promise<string> {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-patch-commit-'))

  try {
    await execFileAsync('git', ['init', '--quiet'], { cwd: repoRoot })
    await execFileAsync('git', ['config', 'user.email', 'skills-package-manager@example.com'], {
      cwd: repoRoot,
    })
    await execFileAsync('git', ['config', 'user.name', 'skills-package-manager'], {
      cwd: repoRoot,
    })

    await copySkillDir(baseDir, repoRoot)
    await execFileAsync('git', ['add', '--all'], { cwd: repoRoot })
    await execFileAsync(
      'git',
      ['commit', '--quiet', '--allow-empty', '--no-gpg-sign', '-m', 'base'],
      {
        cwd: repoRoot,
      },
    )

    await clearDirectoryExceptGit(repoRoot)
    await copySkillDir(editedDir, repoRoot)

    const { stdout } = await execFileAsync(
      'git',
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
      { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
    )

    return stdout
  } finally {
    await rm(repoRoot, { recursive: true, force: true }).catch(() => {})
  }
}

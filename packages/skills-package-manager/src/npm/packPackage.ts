import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export type PackedNpmPackage = {
  name: string
  version: string
  integrity?: string
  tarballPath: string
}

type NpmPackResult = {
  name: string
  version: string
  integrity?: string
  filename: string
}

export async function packNpmPackage(specifier: string): Promise<PackedNpmPackage> {
  const packRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-npm-pack-'))

  try {
    const { stdout, stderr } = await execFileAsync(
      npmExecutable,
      ['pack', specifier, '--json', '--ignore-scripts', '--silent'],
      { cwd: packRoot },
    )
    const parsed = JSON.parse(stdout) as NpmPackResult[]
    const result = parsed[0]

    if (!result?.name || !result.version || !result.filename) {
      throw new Error(`Failed to pack npm package for ${specifier}${stderr ? `: ${stderr}` : ''}`)
    }

    return {
      name: result.name,
      version: result.version,
      integrity: result.integrity,
      tarballPath: path.join(packRoot, result.filename),
    }
  } catch (error) {
    await rm(packRoot, { recursive: true, force: true }).catch(() => {})
    throw new Error(`Failed to pack npm package for ${specifier}: ${(error as Error).message}`, {
      cause: error as Error,
    })
  }
}

export async function cleanupPackedNpmPackage(tarballPath: string): Promise<void> {
  await rm(path.dirname(tarballPath), { recursive: true, force: true }).catch(() => {})
}

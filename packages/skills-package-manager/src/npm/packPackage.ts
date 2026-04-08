import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

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
    const { stdout } = await execFileAsync('npm', ['pack', specifier, '--json'], { cwd: packRoot })
    const parsed = JSON.parse(stdout) as NpmPackResult[]
    const result = parsed[0]

    if (!result?.name || !result.version || !result.filename) {
      throw new Error(`Failed to pack npm package for ${specifier}`)
    }

    return {
      name: result.name,
      version: result.version,
      integrity: result.integrity,
      tarballPath: path.join(packRoot, result.filename),
    }
  } catch (error) {
    await rm(packRoot, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

export async function cleanupPackedNpmPackage(tarballPath: string): Promise<void> {
  await rm(path.dirname(tarballPath), { recursive: true, force: true }).catch(() => {})
}

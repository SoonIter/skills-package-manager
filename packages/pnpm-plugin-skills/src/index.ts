import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { installCommand, type SkillsManifest } from 'skills-package-manager'

function findManifestRoot(startDir: string): string | null {
  const resolvedStartDir = path.resolve(startDir)
  const rootDir = path.parse(resolvedStartDir).root

  for (
    let currentDir = resolvedStartDir;
    currentDir !== rootDir;
    currentDir = path.dirname(currentDir)
  ) {
    if (existsSync(path.join(currentDir, 'skills.json'))) {
      return currentDir
    }
  }

  return existsSync(path.join(rootDir, 'skills.json')) ? rootDir : null
}

function readPluginManifest(rootDir: string): SkillsManifest | null {
  const filePath = path.join(rootDir, 'skills.json')

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as {
      pnpmPlugin?: SkillsManifest['pnpmPlugin']
    }
    return parsed as SkillsManifest
  } catch {
    return null
  }
}

export async function preResolution(
  options: { lockfileDir?: string; workspaceRoot?: string } = {},
) {
  const lockfileDir = options.lockfileDir
  if (!lockfileDir) {
    return undefined
  }

  await installCommand({ cwd: lockfileDir })
  return undefined
}

export function afterAllResolved(
  lockfile: Record<string, unknown>,
  _context: { log?: (message: string) => void } = {},
) {
  const manifestRoot = findManifestRoot(process.cwd())
  if (!manifestRoot) {
    return lockfile
  }

  const manifest = readPluginManifest(manifestRoot)
  if (!manifest) {
    return lockfile
  }

  if (manifest.pnpmPlugin?.removePnpmfileChecksum !== true) {
    return lockfile
  }

  delete lockfile.pnpmfileChecksum
  return lockfile
}

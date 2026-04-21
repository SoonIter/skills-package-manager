import path from 'node:path'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import type { NormalizedSkillsManifest } from '../config/types'
import { readInstallState } from '../install/installState'
import { loadNpmConfig } from '../npm/packPackage'
import { createFileSystemCache } from './cache'
import type { InstallState, WorkspaceContext } from './types'

export async function loadConfig(cwd: string): Promise<WorkspaceContext> {
  const manifest = await readSkillsManifest(cwd)
  const lockfile = await readSkillsLock(cwd)
  const npmConfig = await loadNpmConfig(cwd)
  const installDir = manifest?.installDir ?? '.agents/skills'
  const installState = await readInstallState(cwd, installDir)
  const cache = createFileSystemCache(cwd)

  return {
    cwd: path.resolve(cwd),
    manifest: normalizeManifest(manifest),
    manifestExists: manifest !== null,
    lockfile,
    npmConfig,
    installState: installState as InstallState | null,
    cache,
  }
}

function normalizeManifest(manifest: NormalizedSkillsManifest | null): NormalizedSkillsManifest {
  if (manifest) {
    return manifest
  }

  return {
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {},
  }
}

export { readInstallState }

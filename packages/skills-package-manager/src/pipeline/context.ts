import path from 'node:path'
import { readSkillsManifest } from '../config/readSkillsManifest'
import type { NormalizedSkillsManifest } from '../config/types'
import { loadNpmConfig } from '../npm/packPackage'
import { createFileSystemCache } from './cache'
import type { WorkspaceContext } from './types'

export async function loadConfig(cwd: string): Promise<WorkspaceContext> {
  const manifest = await readSkillsManifest(cwd)
  const npmConfig = await loadNpmConfig(cwd)
  const cache = createFileSystemCache(cwd)

  return {
    cwd: path.resolve(cwd),
    manifest: normalizeManifest(manifest),
    manifestExists: manifest !== null,
    npmConfig,
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
    dependencies: {},
  }
}

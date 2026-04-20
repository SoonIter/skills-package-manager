import { ManifestRepository } from '../repositories/ManifestRepository'
import type { NormalizedSkillsManifest } from './types'

export async function readSkillsManifest(
  rootDir: string,
): Promise<NormalizedSkillsManifest | null> {
  const manifest = await new ManifestRepository().read(rootDir)
  return (
    (manifest?.toJSON({ includeDefaults: true }) as NormalizedSkillsManifest | undefined) ?? null
  )
}

import { ManifestRepository } from '../repositories/ManifestRepository'
import { Manifest } from '../structures/Manifest'
import type { SkillsManifest } from './types'

export async function writeSkillsManifest(
  rootDir: string,
  manifest: SkillsManifest,
): Promise<void> {
  await new ManifestRepository().write(rootDir, Manifest.from(manifest))
}

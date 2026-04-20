import { Lockfile } from '../structures/Lockfile'
import { Manifest } from '../structures/Manifest'
import type { NormalizedSkillsManifest, SkillsLock } from './types'

export async function isLockInSync(
  rootDir: string,
  manifest: NormalizedSkillsManifest,
  lock: SkillsLock | null,
): Promise<boolean> {
  if (!lock) {
    return false
  }

  return Lockfile.from(lock).isInSyncWith(Manifest.from(manifest), rootDir)
}

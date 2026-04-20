import { ResolveQueue } from '../pipeline/ResolveQueue'
import { LockEntry } from '../structures/LockEntry'
import { Lockfile } from '../structures/Lockfile'
import { Manifest } from '../structures/Manifest'
import { Specifier } from '../structures/Specifier'
import type {
  InstallProgressListener,
  NormalizedSkillsManifest,
  SkillsLock,
  SkillsLockEntry,
} from './types'

const resolveQueue = new ResolveQueue()

export async function resolveLockEntry(
  cwd: string,
  specifier: string,
  skillName?: string,
): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const parsedSpecifier = Specifier.parse(specifier)
  const resolved = await resolveQueue.resolveSkill(
    cwd,
    Manifest.from({ skills: {} }),
    skillName ?? parsedSpecifier.skillName,
    parsedSpecifier.normalized,
  )

  return {
    skillName: resolved.skillName,
    entry: resolved.entry.toJSON(),
  }
}

export async function attachManifestPatchToEntry(
  cwd: string,
  manifest: NormalizedSkillsManifest,
  skillName: string,
  entry: SkillsLockEntry,
): Promise<SkillsLockEntry> {
  return (
    await resolveQueue.attachManifestPatch(
      cwd,
      Manifest.from(manifest),
      skillName,
      new LockEntry(entry),
    )
  ).toJSON()
}

export async function syncSkillsLock(
  cwd: string,
  manifest: NormalizedSkillsManifest,
  currentLock: SkillsLock | null,
  options?: {
    onProgress?: InstallProgressListener
  },
): Promise<SkillsLock> {
  return (
    await resolveQueue.syncLockfile({
      rootDir: cwd,
      manifest: Manifest.from(manifest),
      currentLock: currentLock ? Lockfile.from(currentLock) : null,
      onProgress: options?.onProgress,
    })
  ).toJSON()
}

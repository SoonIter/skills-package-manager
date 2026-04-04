import { isLockInSync } from '../config/compareSkillsLock'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { InstallCommandOptions } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { ErrorCode, ManifestError } from '../errors'
import { fetchSkillsFromLock, linkSkillsFromLock } from '../install/installSkills'

export async function installCommand(options: InstallCommandOptions) {
  const manifest = await readSkillsManifest(options.cwd)
  if (!manifest) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  const currentLock = await readSkillsLock(options.cwd)

  if (options.frozenLockfile) {
    // Frozen mode: lock must exist and be in sync
    if (!currentLock) {
      throw new ManifestError({
        code: ErrorCode.LOCKFILE_NOT_FOUND,
        filePath: `${options.cwd}/skills-lock.yaml`,
        message: 'Lockfile is required in frozen mode but none was found. Run "spm install" first.',
      })
    }
    if (!isLockInSync(manifest, currentLock)) {
      throw new ManifestError({
        code: ErrorCode.LOCKFILE_OUTDATED,
        filePath: `${options.cwd}/skills-lock.yaml`,
        message:
          'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
      })
    }

    await fetchSkillsFromLock(options.cwd, manifest, currentLock)
    await linkSkillsFromLock(options.cwd, manifest, currentLock)

    return { status: 'installed', installed: Object.keys(currentLock.skills) } as const
  }

  // Normal mode: sync lock with manifest (may trigger network requests)
  const lockfile = await syncSkillsLock(options.cwd, manifest, currentLock)

  await fetchSkillsFromLock(options.cwd, manifest, lockfile)
  await linkSkillsFromLock(options.cwd, manifest, lockfile)

  // Write lockfile only after all operations succeed (atomicity)
  await writeSkillsLock(options.cwd, lockfile)

  return { status: 'installed', installed: Object.keys(lockfile.skills) } as const
}

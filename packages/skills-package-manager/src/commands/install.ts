import { isLockInSync } from '../config/compareSkillsLock'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { InstallCommandOptions, SkillsLock } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { ErrorCode, ManifestError } from '../errors'
import {
  fetchSkillsFromLock,
  linkSkillsFromLock,
  withBundledSelfSkillLock,
} from '../install/installSkills'
import { createInstallProgressReporter } from '../install/progressReporter'

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
  const reporter = createInstallProgressReporter()
  const onProgress = (event: Parameters<typeof reporter.onProgress>[0]) =>
    reporter.onProgress(event)
  let started = false

  try {
    let lockfile: SkillsLock

    if (options.frozenLockfile) {
      // Frozen mode: lock must exist and be in sync
      if (!currentLock) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_NOT_FOUND,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is required in frozen mode but none was found. Run "spm install" first.',
        })
      }
      if (!(await isLockInSync(options.cwd, manifest, currentLock))) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_OUTDATED,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
        })
      }
      lockfile = currentLock
    } else {
      // Normal mode: sync lock with manifest (may trigger network requests)
      lockfile = await syncSkillsLock(options.cwd, manifest, currentLock, {
        onProgress,
      })
    }

    const runtimeLock = await withBundledSelfSkillLock(options.cwd, manifest, lockfile)

    reporter.start(Object.keys(runtimeLock.skills).length)
    started = true
    for (const skillName of Object.keys(lockfile.skills)) {
      onProgress({ type: 'resolved', skillName })
    }

    reporter.setPhase('fetching')
    await fetchSkillsFromLock(options.cwd, manifest, runtimeLock, { onProgress })
    reporter.setPhase('linking')
    await linkSkillsFromLock(options.cwd, manifest, runtimeLock, { onProgress })

    // Write lockfile only after all operations succeed (atomicity)
    reporter.setPhase('finalizing')
    if (!options.frozenLockfile) {
      await writeSkillsLock(options.cwd, lockfile)
    }
    reporter.complete()

    return { status: 'installed', installed: Object.keys(runtimeLock.skills) } as const
  } catch (error) {
    if (started) {
      reporter.fail()
    }
    throw error
  }
}

import { isLockInSync } from '../config/compareSkillsLock'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { expandSkillsManifest } from '../config/skillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { InstallCommandOptions } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { ErrorCode, ManifestError } from '../errors'
import { fetchSkillsFromLock, linkSkillsFromLock } from '../install/installSkills'
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
  const effectiveManifest = await expandSkillsManifest(options.cwd, manifest)

  const currentLock = await readSkillsLock(options.cwd)
  const totalSkills = Object.keys(effectiveManifest.skills).length
  const reporter = createInstallProgressReporter()
  const onProgress = (event: Parameters<typeof reporter.onProgress>[0]) =>
    reporter.onProgress(event)
  let started = false

  try {
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
      if (!isLockInSync(effectiveManifest, currentLock)) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_OUTDATED,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
        })
      }

      reporter.start(totalSkills)
      started = true
      for (const skillName of Object.keys(currentLock.skills)) {
        onProgress({ type: 'resolved', skillName })
      }

      reporter.setPhase('fetching')
      await fetchSkillsFromLock(options.cwd, effectiveManifest, currentLock, { onProgress })
      reporter.setPhase('linking')
      await linkSkillsFromLock(options.cwd, effectiveManifest, currentLock, { onProgress })
      reporter.setPhase('finalizing')
      reporter.complete()

      return { status: 'installed', installed: Object.keys(currentLock.skills) } as const
    }

    // Normal mode: sync lock with manifest (may trigger network requests)
    reporter.start(totalSkills)
    started = true
    const lockfile = await syncSkillsLock(options.cwd, effectiveManifest, currentLock, {
      onProgress,
    })

    reporter.setPhase('fetching')
    await fetchSkillsFromLock(options.cwd, effectiveManifest, lockfile, { onProgress })
    reporter.setPhase('linking')
    await linkSkillsFromLock(options.cwd, effectiveManifest, lockfile, { onProgress })

    // Write lockfile only after all operations succeed (atomicity)
    reporter.setPhase('finalizing')
    await writeSkillsLock(options.cwd, lockfile)
    reporter.complete()

    return { status: 'installed', installed: Object.keys(lockfile.skills) } as const
  } catch (error) {
    if (started) {
      reporter.fail()
    }
    throw error
  }
}

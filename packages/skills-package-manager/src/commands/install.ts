import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import { isLockInSync, isSkillsLockEqual } from '../config/compareSkillsLock'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type { InstallCommandOptions, SkillsLock } from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { ErrorCode, ManifestError } from '../errors'
import { createInstallProgressReporter } from '../install/progressReporter'
import { withBundledSelfSkillLock } from '../install/withBundledSelfSkillLock'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'

async function readInstallDirLock(cwd: string, installDir: string): Promise<SkillsLock | null> {
  const filePath = path.join(cwd, installDir, 'lock.yaml')
  try {
    return YAML.parse(await readFile(filePath, 'utf8')) as SkillsLock
  } catch {
    return null
  }
}

async function writeInstallDirLock(
  cwd: string,
  installDir: string,
  lockfile: SkillsLock,
): Promise<void> {
  const dirPath = path.join(cwd, installDir)
  const filePath = path.join(dirPath, 'lock.yaml')
  try {
    await writeFile(filePath, YAML.stringify(lockfile), 'utf8')
  } catch (error) {
    throw new Error(`Failed to write install-dir lock copy: ${(error as Error).message}`)
  }
}

export async function installCommand(options: InstallCommandOptions) {
  const ctx = await loadConfig(options.cwd)

  if (!ctx.manifestExists) {
    return { status: 'skipped' as const, reason: 'manifest-missing' }
  }

  const reporter = createInstallProgressReporter()
  const onProgress = (event: Parameters<typeof reporter.onProgress>[0]) => {
    reporter.onProgress(event)
    options.onProgress?.(event)
  }
  let started = false

  try {
    let lockfile: SkillsLock
    const installDir = ctx.manifest.installDir ?? '.agents/skills'

    if (options.frozenLockfile) {
      // Frozen mode: lock must exist and be in sync
      if (!ctx.lockfile) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_NOT_FOUND,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is required in frozen mode but none was found. Run "spm install" first.',
        })
      }
      if (
        !(await isLockInSync(
          options.cwd,
          ctx.manifest,
          ctx.lockfile,
          ctx.manifestStat,
          ctx.installState,
        ))
      ) {
        throw new ManifestError({
          code: ErrorCode.LOCKFILE_OUTDATED,
          filePath: `${options.cwd}/skills-lock.yaml`,
          message:
            'Lockfile is out of sync with manifest. Run install without --frozen-lockfile to update.',
        })
      }
      lockfile = ctx.lockfile
    } else {
      // Normal mode: check install-dir lock copy for fast-path skip.
      // Only skip when there are no file: skills, because tarball contents
      // may change without the lockfile being modified. link: skills use
      // symlinks so they always reflect the current source.
      const hasLocalSource = Object.values(ctx.manifest.skills).some((s) => s.startsWith('file:'))
      const installDirLock = await readInstallDirLock(options.cwd, installDir)
      if (
        !hasLocalSource &&
        ctx.lockfile &&
        installDirLock &&
        isSkillsLockEqual(ctx.lockfile, installDirLock) &&
        (await isLockInSync(options.cwd, ctx.manifest, ctx.lockfile))
      ) {
        console.info('Skills Lockfile is up to date, resolve skipped')
        lockfile = ctx.lockfile
      } else {
        lockfile = await syncSkillsLock(options.cwd, ctx.manifest, ctx.lockfile, {
          manifestStat: ctx.manifestStat,
          installState: ctx.installState,
        })
      }
    }

    const runtimeLock = await withBundledSelfSkillLock(options.cwd, ctx.manifest, lockfile)

    reporter.start(Object.keys(runtimeLock.skills).length)
    started = true
    for (const skillName of Object.keys(runtimeLock.skills)) {
      onProgress({ type: 'resolved', skillName })
    }

    reporter.setPhase('fetching')
    await runPipeline({
      ctx,
      entries: runtimeLock.skills,
      skipResolve: true,
      options: { onProgress },
    })

    reporter.setPhase('finalizing')
    if (!options.frozenLockfile) {
      await writeSkillsLock(options.cwd, lockfile)
    }
    await writeInstallDirLock(options.cwd, installDir, lockfile)
    reporter.complete()

    return { status: 'installed' as const, installed: Object.keys(runtimeLock.skills) }
  } catch (error) {
    if (started) {
      reporter.fail()
    }
    throw error
  }
}

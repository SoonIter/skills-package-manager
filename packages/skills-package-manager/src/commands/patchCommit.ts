import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { PatchCommitCommandOptions, PatchCommitCommandResult } from '../config/types'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { extractSkillToDir } from '../install/extractSkillToDir'
import { installStageHooks } from '../install/installSkills'
import { generateSkillPatch, readPatchEditState } from '../patches/skillPatch'
import { loadConfig } from '../pipeline/loadConfig'
import { ResolveQueue } from '../pipeline/ResolveQueue'
import { runResolvedPipeline } from '../pipeline/runPipeline'
import { LockfileRepository } from '../repositories/LockfileRepository'
import { ManifestRepository } from '../repositories/ManifestRepository'
import { LockEntry } from '../structures/LockEntry'
import { Manifest } from '../structures/Manifest'
import { toPortableRelativePath } from '../utils/path'

function resolvePatchFilePath(
  cwd: string,
  skillName: string,
  existingPatchPath?: string,
  patchesDir?: string,
): string {
  if (patchesDir) {
    return path.resolve(cwd, patchesDir, `${skillName}.patch`)
  }

  if (existingPatchPath) {
    return path.resolve(cwd, existingPatchPath)
  }

  return path.resolve(cwd, 'patches', `${skillName}.patch`)
}

export async function patchCommitCommand(
  options: PatchCommitCommandOptions,
): Promise<PatchCommitCommandResult> {
  const config = await loadConfig(options.cwd)
  if (!config.manifest) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  const editDir = path.resolve(options.cwd, options.editDir)
  const editState = await readPatchEditState(editDir)

  if (!config.manifest.hasSkill(editState.skillName)) {
    throw new SkillError({
      code: ErrorCode.SKILL_NOT_FOUND,
      skillName: editState.skillName,
      message: `Unknown skill: ${editState.skillName}`,
    })
  }

  if (config.manifest.getSkillSpecifier(editState.skillName) !== editState.originalSpecifier) {
    throw new SkillError({
      code: ErrorCode.VALIDATION_ERROR,
      skillName: editState.skillName,
      message: `Skill "${editState.skillName}" changed since "spm patch" created ${editDir}`,
    })
  }

  const baseDir = await mkdtemp(path.join(tmpdir(), `skills-pm-patch-base-${editState.skillName}-`))

  try {
    await extractSkillToDir(options.cwd, editState.baseEntry, baseDir)
    const patchContent = await generateSkillPatch(baseDir, editDir)

    if (!patchContent.trim()) {
      throw new SkillError({
        code: ErrorCode.VALIDATION_ERROR,
        skillName: editState.skillName,
        message: `No changes found in ${editDir}`,
      })
    }

    const currentPatchedSkills = config.manifest.normalize().patchedSkills
    const patchFilePath = resolvePatchFilePath(
      options.cwd,
      editState.skillName,
      currentPatchedSkills?.[editState.skillName],
      options.patchesDir,
    )
    await mkdir(path.dirname(patchFilePath), { recursive: true })
    await writeFile(patchFilePath, patchContent, 'utf8')

    const relativePatchPath = toPortableRelativePath(options.cwd, patchFilePath)
    const nextManifest = Manifest.from({
      ...config.manifest.toJSON(),
      patchedSkills: {
        ...(currentPatchedSkills ?? {}),
        [editState.skillName]: relativePatchPath,
      },
    })

    const resolveQueue = new ResolveQueue()
    const baseLock = await resolveQueue.ensureBaseLockfile({
      rootDir: options.cwd,
      manifest: config.manifest,
      currentLock: config.lockfile,
      npmConfig: config.npmConfig,
    })
    const patchedEntry = await resolveQueue.attachManifestPatch(
      options.cwd,
      nextManifest,
      editState.skillName,
      new LockEntry(editState.baseEntry),
    )

    const nextLock = baseLock
      .withManifest(nextManifest)
      .withEntry(editState.skillName, patchedEntry)
    const runtimeLock = await resolveQueue.createRuntimeLockfile({
      rootDir: options.cwd,
      manifest: nextManifest,
      lockfile: nextLock,
      npmConfig: config.npmConfig,
    })

    await runResolvedPipeline({
      rootDir: options.cwd,
      manifest: nextManifest,
      lockfile: runtimeLock,
      currentInstallState: config.installState,
      hooks: {
        beforeFetch: installStageHooks.beforeFetch,
      },
    })
    await new ManifestRepository().write(options.cwd, nextManifest)
    await new LockfileRepository().write(options.cwd, nextLock)

    console.info(relativePatchPath)

    return {
      status: 'patched',
      skillName: editState.skillName,
      patchFile: patchFilePath,
    }
  } finally {
    await rm(baseDir, { recursive: true, force: true }).catch(() => {})
  }
}

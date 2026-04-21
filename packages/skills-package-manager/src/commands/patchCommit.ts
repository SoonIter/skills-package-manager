import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isLockInSync } from '../config/compareSkillsLock'
import { attachManifestPatchToEntry, syncSkillsLock } from '../config/syncSkillsLock'
import type {
  NormalizedSkillsManifest,
  PatchCommitCommandOptions,
  PatchCommitCommandResult,
  SkillsLock,
} from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { extractSkillToDir } from '../install/extractSkillToDir'
import { withBundledSelfSkillLock } from '../install/withBundledSelfSkillLock'
import { generateSkillPatch, readPatchEditState } from '../patches/skillPatch'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'
import { toPortableRelativePath } from '../utils/path'

async function createBaseLock(
  cwd: string,
  manifest: NormalizedSkillsManifest,
  currentLock: SkillsLock | null,
) {
  if (currentLock && (await isLockInSync(cwd, manifest, currentLock))) {
    return {
      ...currentLock,
      skills: { ...currentLock.skills },
    }
  }

  return syncSkillsLock(cwd, manifest, currentLock)
}

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
  const ctx = await loadConfig(options.cwd)

  if (!ctx.manifest.skills || Object.keys(ctx.manifest.skills).length === 0) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  const editDir = path.resolve(options.cwd, options.editDir)
  const editState = await readPatchEditState(editDir)

  if (!(editState.skillName in ctx.manifest.skills)) {
    throw new SkillError({
      code: ErrorCode.SKILL_NOT_FOUND,
      skillName: editState.skillName,
      message: `Unknown skill: ${editState.skillName}`,
    })
  }

  if (ctx.manifest.skills[editState.skillName] !== editState.originalSpecifier) {
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

    const patchFilePath = resolvePatchFilePath(
      options.cwd,
      editState.skillName,
      ctx.manifest.patchedSkills?.[editState.skillName],
      options.patchesDir,
    )
    await mkdir(path.dirname(patchFilePath), { recursive: true })
    await writeFile(patchFilePath, patchContent, 'utf8')

    const relativePatchPath = toPortableRelativePath(options.cwd, patchFilePath)
    const nextManifest = {
      ...ctx.manifest,
      patchedSkills: {
        ...(ctx.manifest.patchedSkills ?? {}),
        [editState.skillName]: relativePatchPath,
      },
    }

    const baseLock = await createBaseLock(options.cwd, ctx.manifest, ctx.lockfile)
    const patchedEntry = await attachManifestPatchToEntry(
      options.cwd,
      nextManifest,
      editState.skillName,
      editState.baseEntry,
    )

    const nextLock: SkillsLock = {
      ...baseLock,
      installDir: nextManifest.installDir ?? '.agents/skills',
      linkTargets: nextManifest.linkTargets ?? [],
      skills: {
        ...baseLock.skills,
        [editState.skillName]: patchedEntry,
      },
    }

    const runtimeLock = await withBundledSelfSkillLock(options.cwd, nextManifest, nextLock)

    const pipelineCtx = {
      ...ctx,
      manifest: nextManifest,
      lockfile: nextLock,
    }

    await runPipeline({
      ctx: pipelineCtx,
      entries: runtimeLock.skills,
      skipResolve: true,
    })

    await writeSkillsManifest(options.cwd, nextManifest)
    await writeSkillsLock(options.cwd, nextLock)

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

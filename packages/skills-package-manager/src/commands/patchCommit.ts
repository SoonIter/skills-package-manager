import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { attachManifestPatchToEntry, resolveSkillsPlan } from '../config/resolveSkillsPlan'
import type {
  NormalizedSkillsManifest,
  PatchCommitCommandOptions,
  PatchCommitCommandResult,
  ResolvedSkillsPlan,
} from '../config/types'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { extractSkillToDir } from '../install/extractSkillToDir'
import { generateSkillPatch, readPatchEditState } from '../patches/skillPatch'
import { runPipeline } from '../pipeline'
import { loadConfig } from '../pipeline/context'
import { toPortableRelativePath } from '../utils/path'

async function createBasePlan(
  cwd: string,
  manifest: NormalizedSkillsManifest,
) {
  return resolveSkillsPlan(cwd, manifest)
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

    const basePlan = await createBasePlan(options.cwd, ctx.manifest)
    const patchedEntry = await attachManifestPatchToEntry(
      options.cwd,
      nextManifest,
      editState.skillName,
      editState.baseEntry,
    )

    const nextPlan: ResolvedSkillsPlan = {
      ...basePlan,
      installDir: nextManifest.installDir ?? '.agents/skills',
      linkTargets: nextManifest.linkTargets ?? [],
      skills: {
        ...basePlan.skills,
        [editState.skillName]: patchedEntry,
      },
    }

    const pipelineCtx = {
      ...ctx,
      manifest: nextManifest,
    }

    await runPipeline({
      ctx: pipelineCtx,
      plan: nextPlan,
      skipResolve: true,
    })

    await writeSkillsManifest(options.cwd, nextManifest)

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

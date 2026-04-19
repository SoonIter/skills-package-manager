import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isLockInSync } from '../config/compareSkillsLock'
import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { attachManifestPatchToEntry, syncSkillsLock } from '../config/syncSkillsLock'
import type {
  PatchCommitCommandOptions,
  PatchCommitCommandResult,
  SkillsLock,
} from '../config/types'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { ErrorCode, ManifestError, SkillError } from '../errors'
import { extractSkillToDir } from '../install/extractSkillToDir'
import {
  fetchSkillsFromLock,
  linkSkillsFromLock,
  withBundledSelfSkillLock,
} from '../install/installSkills'
import { generateSkillPatch, readPatchEditState } from '../patches/skillPatch'

function toPortableRelativePath(from: string, to: string): string {
  const relativePath = path.relative(from, to) || '.'
  return path.sep === '/' ? relativePath : relativePath.split(path.sep).join('/')
}

async function createBaseLock(
  cwd: string,
  manifest: NonNullable<Awaited<ReturnType<typeof readSkillsManifest>>>,
  currentLock: SkillsLock | null,
) {
  if (currentLock && isLockInSync(manifest, currentLock)) {
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
  const manifest = await readSkillsManifest(options.cwd)
  if (!manifest) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  const editDir = path.resolve(options.cwd, options.editDir)
  const editState = await readPatchEditState(editDir)

  if (!(editState.skillName in manifest.skills)) {
    throw new SkillError({
      code: ErrorCode.SKILL_NOT_FOUND,
      skillName: editState.skillName,
      message: `Unknown skill: ${editState.skillName}`,
    })
  }

  if (manifest.skills[editState.skillName] !== editState.originalSpecifier) {
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
      manifest.patchedSkills?.[editState.skillName],
      options.patchesDir,
    )
    await mkdir(path.dirname(patchFilePath), { recursive: true })
    await writeFile(patchFilePath, patchContent, 'utf8')

    const relativePatchPath = toPortableRelativePath(options.cwd, patchFilePath)
    const nextManifest = {
      ...manifest,
      patchedSkills: {
        ...(manifest.patchedSkills ?? {}),
        [editState.skillName]: relativePatchPath,
      },
    }

    const currentLock = await readSkillsLock(options.cwd)
    const baseLock = await createBaseLock(options.cwd, manifest, currentLock)
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

    await fetchSkillsFromLock(options.cwd, nextManifest, runtimeLock)
    await linkSkillsFromLock(options.cwd, nextManifest, runtimeLock)
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

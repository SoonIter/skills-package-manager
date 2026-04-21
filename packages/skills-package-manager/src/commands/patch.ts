import { access, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isLockInSync } from '../config/compareSkillsLock'
import { syncSkillsLock } from '../config/syncSkillsLock'
import type {
  NormalizedSkillsManifest,
  PatchCommandOptions,
  PatchCommandResult,
  SkillsLock,
  SkillsLockEntry,
} from '../config/types'
import { convertNodeError, ErrorCode, FileSystemError, ManifestError, SkillError } from '../errors'
import { extractSkillToDir } from '../install/extractSkillToDir'
import { applySkillPatch, writePatchEditState } from '../patches/skillPatch'
import { loadConfig } from '../pipeline/context'

async function ensureEditDirDoesNotExist(editDir: string) {
  try {
    await access(editDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }

    throw convertNodeError(error as NodeJS.ErrnoException, {
      operation: 'access',
      path: editDir,
    })
  }

  throw new FileSystemError({
    code: ErrorCode.FILE_EXISTS,
    operation: 'mkdir',
    path: editDir,
    message: `Patch edit directory already exists: ${editDir}`,
  })
}

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

function getUnpatchedBaseEntry(entry: SkillsLockEntry): SkillsLockEntry {
  if (!entry.patch) {
    return entry
  }

  const { patch: _patch, ...baseEntry } = entry
  return baseEntry
}

async function resolveEditDir(cwd: string, skillName: string, editDir?: string): Promise<string> {
  if (editDir) {
    return path.resolve(cwd, editDir)
  }

  const sanitizedSkillName = skillName.replace(/[^a-zA-Z0-9._-]+/g, '-')
  return mkdtemp(path.join(tmpdir(), `skills-pm-patch-${sanitizedSkillName}-`))
}

export async function patchCommand(options: PatchCommandOptions): Promise<PatchCommandResult> {
  const ctx = await loadConfig(options.cwd)

  if (!ctx.manifest.skills || Object.keys(ctx.manifest.skills).length === 0) {
    throw new ManifestError({
      code: ErrorCode.MANIFEST_NOT_FOUND,
      filePath: `${options.cwd}/skills.json`,
      message: 'No skills.json found in the current directory. Run "spm init" to create one.',
    })
  }

  if (!(options.skillName in ctx.manifest.skills)) {
    throw new SkillError({
      code: ErrorCode.SKILL_NOT_FOUND,
      skillName: options.skillName,
      message: `Unknown skill: ${options.skillName}`,
    })
  }

  const baseLock = await createBaseLock(options.cwd, ctx.manifest, ctx.lockfile)
  const currentEntry = baseLock.skills[options.skillName]

  if (!currentEntry) {
    throw new SkillError({
      code: ErrorCode.SKILL_NOT_FOUND,
      skillName: options.skillName,
      message: `Skill "${options.skillName}" is missing from the resolved lockfile state`,
    })
  }

  const editDir = await resolveEditDir(options.cwd, options.skillName, options.editDir)
  if (options.editDir) {
    await ensureEditDirDoesNotExist(editDir)
  }

  const baseEntry = getUnpatchedBaseEntry(currentEntry)
  await extractSkillToDir(options.cwd, baseEntry, editDir)

  const existingPatchPath = ctx.manifest.patchedSkills?.[options.skillName]
  if (existingPatchPath && !options.ignoreExisting) {
    await applySkillPatch(editDir, path.resolve(options.cwd, existingPatchPath))
  }

  await writePatchEditState(editDir, {
    version: 1,
    skillName: options.skillName,
    originalSpecifier: ctx.manifest.skills[options.skillName],
    baseEntry,
  })

  console.info(editDir)

  return {
    status: 'patched',
    skillName: options.skillName,
    editDir,
    originalSpecifier: ctx.manifest.skills[options.skillName],
  }
}

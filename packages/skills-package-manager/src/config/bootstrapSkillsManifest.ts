import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { normalizeSkillsManifest } from './skillsManifest'
import type { NormalizedSkillsManifest, SkillsManifest } from './types'
import { writeSkillsManifest } from './writeSkillsManifest'

const INSTALL_DIR_CANDIDATES = ['.agents/skills', '.agent/skills'] as const
const LINK_TARGET_CANDIDATES = ['.claude/skills'] as const

type InstallDirCandidate = {
  installDir: string
  skillNames: string[]
  lockMatches: number
}

async function hasSkillMd(dirPath: string): Promise<boolean> {
  try {
    const skillDoc = await stat(path.join(dirPath, 'SKILL.md'))
    return skillDoc.isFile()
  } catch {
    return false
  }
}

async function listInstalledSkillNames(rootDir: string, installDir: string): Promise<string[]> {
  const absoluteInstallDir = path.join(rootDir, installDir)

  try {
    const entries = await readdir(absoluteInstallDir, { withFileTypes: true })
    const skillNames: string[] = []

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue
      }

      const skillDir = path.join(absoluteInstallDir, entry.name)
      try {
        const stats = await stat(skillDir)
        if (stats.isDirectory() && (await hasSkillMd(skillDir))) {
          skillNames.push(entry.name)
        }
      } catch {
        // Ignore broken symlinks and entries that cannot be inspected.
      }
    }

    return skillNames.sort((left, right) => left.localeCompare(right))
  } catch {
    return []
  }
}

async function readVercelLocalLockSkillNames(rootDir: string): Promise<string[]> {
  try {
    const raw = await readFile(path.join(rootDir, 'skills-lock.json'), 'utf8')
    const parsed = JSON.parse(raw) as { skills?: unknown }
    if (!parsed || typeof parsed !== 'object' || !parsed.skills || Array.isArray(parsed.skills)) {
      return []
    }

    if (typeof parsed.skills !== 'object') {
      return []
    }

    return Object.keys(parsed.skills)
  } catch {
    return []
  }
}

function selectInstallDirCandidate(candidates: InstallDirCandidate[]): InstallDirCandidate | null {
  const withSkills = candidates.filter((candidate) => candidate.skillNames.length > 0)
  if (withSkills.length === 0) {
    return null
  }

  return [...withSkills].sort(
    (left, right) =>
      right.lockMatches - left.lockMatches ||
      right.skillNames.length - left.skillNames.length ||
      INSTALL_DIR_CANDIDATES.indexOf(left.installDir as (typeof INSTALL_DIR_CANDIDATES)[number]) -
        INSTALL_DIR_CANDIDATES.indexOf(right.installDir as (typeof INSTALL_DIR_CANDIDATES)[number]),
  )[0]
}

async function directoryExists(rootDir: string, targetPath: string): Promise<boolean> {
  try {
    const stats = await stat(path.join(rootDir, targetPath))
    return stats.isDirectory()
  } catch {
    return false
  }
}

async function isSameExistingPath(
  rootDir: string,
  leftPath: string,
  rightPath: string,
): Promise<boolean> {
  try {
    const [leftRealPath, rightRealPath] = await Promise.all([
      realpath(path.join(rootDir, leftPath)),
      realpath(path.join(rootDir, rightPath)),
    ])
    return leftRealPath === rightRealPath
  } catch {
    return false
  }
}

async function discoverLinkTargets(rootDir: string, installDir: string): Promise<string[]> {
  const linkTargets: string[] = []

  for (const linkTarget of LINK_TARGET_CANDIDATES) {
    if (linkTarget === installDir) {
      continue
    }
    if (!(await directoryExists(rootDir, linkTarget))) {
      continue
    }
    if (await isSameExistingPath(rootDir, installDir, linkTarget)) {
      continue
    }

    linkTargets.push(linkTarget)
  }

  return linkTargets
}

function selectSkillNames(candidate: InstallDirCandidate, lockSkillNames: string[]): string[] {
  const installedSkillNames = new Set(candidate.skillNames)
  const lockedInstalledSkillNames = lockSkillNames.filter((skillName) =>
    installedSkillNames.has(skillName),
  )

  return lockedInstalledSkillNames.length > 0 ? lockedInstalledSkillNames : candidate.skillNames
}

export async function bootstrapSkillsManifest(rootDir: string): Promise<NormalizedSkillsManifest> {
  const lockSkillNames = await readVercelLocalLockSkillNames(rootDir)
  const lockSkillNameSet = new Set(lockSkillNames)
  const candidates = await Promise.all(
    INSTALL_DIR_CANDIDATES.map(async (installDir) => {
      const skillNames = await listInstalledSkillNames(rootDir, installDir)
      return {
        installDir,
        skillNames,
        lockMatches: skillNames.filter((skillName) => lockSkillNameSet.has(skillName)).length,
      }
    }),
  )

  const selectedCandidate = selectInstallDirCandidate(candidates)
  if (!selectedCandidate) {
    const manifest: SkillsManifest = {
      installDir: '.agents/skills',
      linkTargets: await discoverLinkTargets(rootDir, '.agents/skills'),
      skills: {},
    }

    await writeSkillsManifest(rootDir, manifest)
    return normalizeSkillsManifest(manifest)
  }

  const selectedSkillNames = selectSkillNames(selectedCandidate, lockSkillNames)
  const manifest: SkillsManifest = {
    installDir: selectedCandidate.installDir,
    linkTargets: await discoverLinkTargets(rootDir, selectedCandidate.installDir),
    skills: Object.fromEntries(
      selectedSkillNames.map((skillName) => [skillName, 'local:*'] as const),
    ),
  }

  await writeSkillsManifest(rootDir, manifest)
  return normalizeSkillsManifest(manifest)
}

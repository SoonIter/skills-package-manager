import { readSkillsLock } from '../config/readSkillsLock'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { syncSkillsLock } from '../config/syncSkillsLock'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { sha256 } from '../utils/hash'
import { linkSkill } from './links'
import { readInstallState, writeInstallState } from './installState'
import { materializeGitSkill } from './materializeGitSkill'
import { materializeLocalSkill } from './materializeLocalSkill'

function extractSkillPath(specifier: string, skillName: string): string {
  const marker = '#path:'
  const index = specifier.indexOf(marker)
  if (index >= 0) {
    return specifier.slice(index + marker.length)
  }
  return `/${skillName}`
}

export async function installSkills(rootDir: string) {
  const manifest = await readSkillsManifest(rootDir)
  if (!manifest) {
    return { status: 'skipped', reason: 'manifest-missing' } as const
  }

  const currentLock = await readSkillsLock(rootDir)
  const lockfile = await syncSkillsLock(rootDir, manifest, currentLock)
  await writeSkillsLock(rootDir, lockfile)

  const lockDigest = sha256(JSON.stringify(lockfile))
  const state = await readInstallState(rootDir)
  if (state?.lockDigest === lockDigest) {
    return { status: 'skipped', reason: 'up-to-date' } as const
  }

  const installDir = manifest.installDir ?? '.agents/skills'
  const linkTargets = manifest.linkTargets ?? []

  for (const [skillName, entry] of Object.entries(lockfile.skills)) {
    if (entry.resolution.type === 'file') {
      await materializeLocalSkill(
        rootDir,
        skillName,
        entry.resolution.path,
        extractSkillPath(entry.specifier, skillName),
        installDir,
      )
    } else if (entry.resolution.type === 'git') {
      await materializeGitSkill(
        rootDir,
        skillName,
        entry.resolution.url,
        entry.resolution.commit,
        entry.resolution.path,
        installDir,
      )
    } else {
      throw new Error(`Unsupported resolution type in 0.1.0 core flow: ${entry.resolution.type}`)
    }

    for (const linkTarget of linkTargets) {
      await linkSkill(rootDir, installDir, linkTarget, skillName)
    }
  }

  await writeInstallState(rootDir, {
    lockDigest,
    installDir,
    linkTargets,
    installerVersion: '0.1.0',
    installedAt: new Date().toISOString(),
  })

  return { status: 'installed', installed: Object.keys(lockfile.skills) } as const
}

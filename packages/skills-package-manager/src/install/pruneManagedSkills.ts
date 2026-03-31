import { lstat, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

async function isManagedSkillDir(dirPath: string): Promise<boolean> {
  try {
    const marker = JSON.parse(await readFile(path.join(dirPath, '.skills-pm.json'), 'utf8'))
    return marker?.installedBy === 'skills-package-manager'
  } catch {
    return false
  }
}

export async function pruneManagedSkills(rootDir: string, installDir: string, linkTargets: string[], wantedSkillNames: string[]) {
  const wanted = new Set(wantedSkillNames)
  const absoluteInstallDir = path.join(rootDir, installDir)

  try {
    const entries = await readdir(absoluteInstallDir)
    for (const entry of entries) {
      if (entry.startsWith('.')) {
        continue
      }

      const skillDir = path.join(absoluteInstallDir, entry)
      if (!(await isManagedSkillDir(skillDir))) {
        continue
      }

      if (wanted.has(entry)) {
        continue
      }

      await rm(skillDir, { recursive: true, force: true })

      for (const linkTarget of linkTargets) {
        const linkPath = path.join(rootDir, linkTarget, entry)
        try {
          const stat = await lstat(linkPath)
          if (stat.isSymbolicLink() || stat.isDirectory() || stat.isFile()) {
            await rm(linkPath, { recursive: true, force: true })
          }
        } catch {
          // ignore missing link target
        }
      }
    }
  } catch {
    // ignore missing install dir
  }
}

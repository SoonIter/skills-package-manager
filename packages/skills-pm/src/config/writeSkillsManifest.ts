import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SkillsManifest } from './types'

export async function writeSkillsManifest(rootDir: string, manifest: SkillsManifest): Promise<void> {
  const filePath = path.join(rootDir, 'skills.json')
  const nextManifest = {
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    skills: manifest.skills,
  }

  await writeFile(filePath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8')
}

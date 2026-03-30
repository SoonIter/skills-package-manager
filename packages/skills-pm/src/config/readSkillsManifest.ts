import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SkillsManifest } from './types'

export async function readSkillsManifest(rootDir: string): Promise<SkillsManifest | null> {
  const filePath = path.join(rootDir, 'skills.json')

  try {
    const raw = await readFile(filePath, 'utf8')
    const json = JSON.parse(raw) as SkillsManifest
    return {
      installDir: json.installDir ?? '.agents/skills',
      linkTargets: json.linkTargets ?? [],
      skills: json.skills ?? {},
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { convertNodeError } from '../errors'
import type { SkillsManifest } from './types'

export async function writeSkillsManifest(
  rootDir: string,
  manifest: SkillsManifest,
): Promise<void> {
  const filePath = path.join(rootDir, 'skills.json')
  const nextManifest = {
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    skills: manifest.skills,
  }

  try {
    await writeFile(filePath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8')
  } catch (error) {
    throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'write', path: filePath })
  }
}

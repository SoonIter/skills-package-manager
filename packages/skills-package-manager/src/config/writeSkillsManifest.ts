import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { convertNodeError } from '../errors'
import type { SkillsManifest } from './types'

const DEFAULT_SCHEMA_URL = 'https://unpkg.com/skills-package-manager@latest/skills.schema.json'

export async function writeSkillsManifest(
  rootDir: string,
  manifest: SkillsManifest,
): Promise<void> {
  const filePath = path.join(rootDir, 'skills.json')
  const nextManifest: Record<string, unknown> = {
    $schema: manifest.$schema ?? DEFAULT_SCHEMA_URL,
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    skills: manifest.skills,
  }

  // Only include selfSkill if it's explicitly set
  if (manifest.selfSkill !== undefined) {
    nextManifest.selfSkill = manifest.selfSkill
  }

  try {
    await writeFile(filePath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8')
  } catch (error) {
    throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'write', path: filePath })
  }
}

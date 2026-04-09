import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { convertNodeError } from '../errors'
import { normalizeSkillsManifest } from './skillsManifest'
import type { SkillsManifest } from './types'

export async function writeSkillsManifest(
  rootDir: string,
  manifest: SkillsManifest,
): Promise<void> {
  const filePath = path.join(rootDir, 'skills.json')
  const normalized = normalizeSkillsManifest(manifest)
  const nextManifest = {
    ...(normalized.$schema ? { $schema: normalized.$schema } : {}),
    installDir: normalized.installDir,
    linkTargets: normalized.linkTargets,
    selfSkill: normalized.selfSkill,
    skills: normalized.skills,
  }

  try {
    await writeFile(filePath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8')
  } catch (error) {
    throw convertNodeError(error as NodeJS.ErrnoException, { operation: 'write', path: filePath })
  }
}

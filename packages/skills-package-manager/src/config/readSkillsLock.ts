import { LockfileRepository } from '../repositories/LockfileRepository'
import type { SkillsLock } from './types'

export async function readSkillsLock(rootDir: string): Promise<SkillsLock | null> {
  const lockfile = await new LockfileRepository().read(rootDir)
  return lockfile?.toJSON() ?? null
}

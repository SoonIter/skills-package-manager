import { LockfileRepository } from '../repositories/LockfileRepository'
import { Lockfile } from '../structures/Lockfile'
import type { SkillsLock } from './types'

export async function writeSkillsLock(rootDir: string, lockfile: SkillsLock): Promise<void> {
  await new LockfileRepository().write(rootDir, Lockfile.from(lockfile))
}

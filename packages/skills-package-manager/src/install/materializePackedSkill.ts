import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { materializeLocalSkill } from './materializeLocalSkill'

const execFileAsync = promisify(execFile)

export async function materializePackedSkill(
  rootDir: string,
  skillName: string,
  tarballPath: string,
  sourcePath: string,
  installDir: string,
) {
  const extractRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-packed-skill-'))

  try {
    await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractRoot])
    await materializeLocalSkill(
      rootDir,
      skillName,
      path.join(extractRoot, 'package'),
      sourcePath,
      installDir,
    )
  } finally {
    await rm(extractRoot, { recursive: true, force: true }).catch(() => {})
  }
}

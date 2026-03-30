import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { materializeLocalSkill } from './materializeLocalSkill'

const execFileAsync = promisify(execFile)

export async function materializeGitSkill(
  rootDir: string,
  skillName: string,
  repoUrl: string,
  commit: string,
  sourcePath: string,
  installDir: string,
) {
  const checkoutRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-git-checkout-'))

  try {
    await execFileAsync('git', ['clone', '--depth', '1', repoUrl, checkoutRoot])
    if (commit && commit !== 'HEAD') {
      await execFileAsync('git', ['checkout', commit], { cwd: checkoutRoot })
    }

    const skillDocPath = path.join(checkoutRoot, sourcePath.replace(/^\//, ''), 'SKILL.md')
    await readFile(skillDocPath, 'utf8')

    await materializeLocalSkill(rootDir, skillName, checkoutRoot, sourcePath, installDir)
  } finally {
    await rm(checkoutRoot, { recursive: true, force: true })
  }
}

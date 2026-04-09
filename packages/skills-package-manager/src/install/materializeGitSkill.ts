import { createGitWorktree } from '../cache/git'
import { materializeLocalSkill } from './materializeLocalSkill'

export async function materializeGitSkill(
  rootDir: string,
  skillName: string,
  repoUrl: string,
  commit: string,
  sourcePath: string,
  installDir: string,
) {
  const { worktreePath, cleanup } = await createGitWorktree(repoUrl, commit)

  try {
    await materializeLocalSkill(rootDir, skillName, worktreePath, sourcePath, installDir)
  } finally {
    await cleanup()
  }
}

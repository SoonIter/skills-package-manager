import { appendFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import {
  cleanupTempProject,
  createSkillDir,
  createTempProject,
  formatProjectTerminalSnapshot,
  pathExists,
  readJson,
  runSpm,
  writeJson,
} from '../helpers/cli'

describe('spm patch e2e', () => {
  it('prepares and commits a skill patch from the built bin', () => {
    const project = createTempProject('patch')

    try {
      const skillDir = createSkillDir(path.join(project, 'local-skills'), 'patch-skill')
      writeJson(path.join(project, 'skills.json'), {
        installDir: '.agents/skills',
        linkTargets: [],
        selfSkill: false,
        skills: {
          'patch-skill': `link:${skillDir}`,
        },
      })

      const patchResult = runSpm(['patch', 'patch-skill', '--edit-dir', 'patch-edit'], {
        cwd: project,
      })
      const editSkillPath = path.join(project, 'patch-edit/SKILL.md')

      expect(patchResult.status).toBe(0)
      expect(pathExists(editSkillPath)).toBe(true)
      expect(formatProjectTerminalSnapshot(patchResult, project)).toMatchSnapshot()
      expect(
        formatProjectTerminalSnapshot(
          { status: 0, signal: null, stdout: `${project}\\patch-edit\n`, stderr: '' },
          project,
        ),
      ).toContain('<project>/patch-edit')

      appendFileSync(editSkillPath, '\nPatched instructions.\n')

      const commitResult = runSpm(['patch-commit', 'patch-edit'], { cwd: project })
      const manifest = readJson<{ patchedSkills: Record<string, string> }>(
        path.join(project, 'skills.json'),
      )
      const installedSkill = readFileSync(
        path.join(project, '.agents/skills/patch-skill/SKILL.md'),
        'utf8',
      )

      expect(commitResult.status).toBe(0)
      expect(manifest.patchedSkills['patch-skill']).toBe('patches/patch-skill.patch')
      expect(pathExists(path.join(project, 'patches/patch-skill.patch'))).toBe(true)
      expect(installedSkill).toContain('Patched instructions.')
      expect(formatProjectTerminalSnapshot(commitResult, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

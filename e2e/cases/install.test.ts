import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import {
  cleanupTempProject,
  createSkillDir,
  createTempProject,
  formatProjectTerminalSnapshot,
  isSymlink,
  pathExists,
  runSpm,
  writeJson,
} from '../helpers/cli'

describe('spm install e2e', () => {
  it('installs a linked skill and creates configured agent links', () => {
    const project = createTempProject('install-link')

    try {
      const skillDir = createSkillDir(path.join(project, 'local-skills'), 'hello-skill')
      writeJson(path.join(project, 'skills.json'), {
        installDir: '.agents/skills',
        linkTargets: ['.claude/skills'],
        selfSkill: false,
        skills: {
          'hello-skill': `link:${skillDir}`,
        },
      })

      const result = runSpm(['install'], { cwd: project })

      expect(result.status).toBe(0)
      expect(pathExists(path.join(project, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
      expect(isSymlink(path.join(project, '.claude/skills/hello-skill'))).toBe(true)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })

  it('skips cleanly when skills.json is missing', () => {
    const project = createTempProject('install-missing-manifest')

    try {
      const result = runSpm(['install'], { cwd: project })

      expect(result.status).toBe(0)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

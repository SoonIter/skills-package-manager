import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import {
  cleanupTempProject,
  createSkillDir,
  createTempProject,
  formatProjectTerminalSnapshot,
  isSymlink,
  pathExists,
  readJson,
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

  it('locks frontmatter dependencies and prints dependency warnings', () => {
    const project = createTempProject('install-frontmatter-dependencies')

    try {
      const rootDir = path.join(project, 'local-skills/root-skill')
      createSkillDir(path.join(project, 'local-skills'), 'dep-skill')
      mkdirSync(rootDir, { recursive: true })
      writeFileSync(
        path.join(rootDir, 'SKILL.md'),
        [
          '---',
          'name: root-skill',
          'description: Root skill',
          'dependencies:',
          '  dep-skill: "link:./local-skills/dep-skill"',
          '  bad-specifier: "link:./local-skills/missing#main"',
          '---',
          '',
          '# root-skill',
          '',
        ].join('\n'),
      )
      writeJson(path.join(project, 'skills.json'), {
        installDir: '.agents/skills',
        linkTargets: ['.claude/skills'],
        selfSkill: false,
        skills: {
          'root-skill': `link:${rootDir}`,
        },
      })

      const result = runSpm(['install'], { cwd: project })
      const manifest = readJson<{
        dependencies?: Record<string, string>
      }>(path.join(project, 'skills.json'))

      expect(result.status).toBe(0)
      expect(manifest.dependencies).toEqual({
        'dep-skill': 'link:./local-skills/dep-skill',
      })
      expect(pathExists(path.join(project, '.agents/skills/dep-skill/SKILL.md'))).toBe(true)
      expect(isSymlink(path.join(project, '.claude/skills/dep-skill'))).toBe(true)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

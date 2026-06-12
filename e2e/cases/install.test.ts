import { mkdirSync } from 'node:fs'
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

  it('bootstraps an empty skills.json when it is missing', () => {
    const project = createTempProject('install-missing-manifest')

    try {
      const result = runSpm(['install'], { cwd: project })
      const manifest = readJson<{
        installDir: string
        linkTargets: string[]
        skills: Record<string, string>
      }>(path.join(project, 'skills.json'))

      expect(result.status).toBe(0)
      expect(manifest.installDir).toBe('.agents/skills')
      expect(manifest.linkTargets).toEqual([])
      expect(manifest.skills).toEqual({})
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })

  it('bootstraps skills.json from existing local skills', () => {
    const project = createTempProject('install-bootstrap-local')

    try {
      createSkillDir(path.join(project, '.agents/skills'), 'existing-skill')
      mkdirSync(path.join(project, '.claude/skills'), { recursive: true })

      const result = runSpm(['install'], { cwd: project })
      const manifest = readJson<{
        installDir: string
        linkTargets: string[]
        skills: Record<string, string>
      }>(path.join(project, 'skills.json'))

      expect(result.status).toBe(0)
      expect(manifest.installDir).toBe('.agents/skills')
      expect(manifest.linkTargets).toEqual(['.claude/skills'])
      expect(manifest.skills).toEqual({ 'existing-skill': 'local:*' })
      expect(pathExists(path.join(project, '.agents/skills/existing-skill/SKILL.md'))).toBe(true)
      expect(isSymlink(path.join(project, '.claude/skills/existing-skill'))).toBe(true)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

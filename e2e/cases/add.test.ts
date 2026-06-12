import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import {
  cleanupTempProject,
  createSkillSource,
  createTempProject,
  formatProjectTerminalSnapshot,
  isSymlink,
  pathExists,
  readJson,
  runSpm,
} from '../helpers/cli'

describe('spm add e2e', () => {
  it('lists skills from a local source without writing a manifest', () => {
    const project = createTempProject('add-list')

    try {
      createSkillSource(project, 'listed-skill', 'Listed skill')

      const result = runSpm(['add', './skill-source', '--list'], { cwd: project })

      expect(result.status).toBe(0)
      expect(pathExists(path.join(project, 'skills.json'))).toBe(false)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })

  it('adds, installs, and links a selected local skill for an agent', () => {
    const project = createTempProject('add-agent')

    try {
      createSkillSource(project, 'agent-skill', 'Agent skill')

      const result = runSpm(
        ['add', './skill-source', '--skill', 'agent-skill', '--agent', 'claude-code', '-y'],
        {
          cwd: project,
        },
      )
      const manifest = readJson<{ skills: Record<string, string>; linkTargets: string[] }>(
        path.join(project, 'skills.json'),
      )

      expect(result.status).toBe(0)
      expect(manifest.skills['agent-skill'].startsWith('link:')).toBe(true)
      expect(manifest.skills['agent-skill'].replace(/\\/g, '/')).toContain(
        '/skill-source/skills/agent-skill',
      )
      expect(manifest.linkTargets).toEqual(['.claude/skills'])
      expect(pathExists(path.join(project, '.agents/skills/agent-skill/SKILL.md'))).toBe(true)
      expect(isSymlink(path.join(project, '.claude/skills/agent-skill'))).toBe(true)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

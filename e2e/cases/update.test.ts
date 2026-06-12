import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import {
  cleanupTempProject,
  createSkillDir,
  createTempProject,
  formatProjectTerminalSnapshot,
  readJson,
  runSpm,
  writeJson,
} from '../helpers/cli'

describe('spm update e2e', () => {
  it('skips link specifiers without rewriting the manifest', () => {
    const project = createTempProject('update-link')

    try {
      const skillDir = createSkillDir(path.join(project, 'local-skills'), 'linked-skill')
      const manifestPath = path.join(project, 'skills.json')
      const manifest = {
        installDir: '.agents/skills',
        linkTargets: [],
        selfSkill: false,
        skills: {
          'linked-skill': `link:${skillDir}`,
        },
      }
      writeJson(manifestPath, manifest)

      const result = runSpm(['update'], { cwd: project })
      const nextManifest = readJson<typeof manifest>(manifestPath)

      expect(result.status).toBe(0)
      expect(nextManifest).toEqual(manifest)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })

  it('reports unknown update targets', () => {
    const project = createTempProject('update-unknown')

    try {
      writeJson(path.join(project, 'skills.json'), {
        installDir: '.agents/skills',
        linkTargets: [],
        selfSkill: false,
        skills: {
          'known-skill': 'local:*',
        },
      })

      const result = runSpm(['update', 'missing-skill'], { cwd: project })

      expect(result.status).not.toBe(0)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

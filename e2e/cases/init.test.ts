import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import {
  cleanupTempProject,
  createTempProject,
  formatProjectTerminalSnapshot,
  readJson,
  runSpm,
} from '../helpers/cli'

describe('spm init e2e', () => {
  it('writes the default manifest with --yes', () => {
    const project = createTempProject('init')

    try {
      const result = runSpm(['init', '--yes'], { cwd: project })
      const manifestPath = path.join(project, 'skills.json')
      const manifest = readJson<Record<string, unknown>>(manifestPath)

      expect(result.status).toBe(0)
      expect(existsSync(manifestPath)).toBe(true)
      expect(manifest).toMatchObject({
        installDir: '.agents/skills',
        linkTargets: [],
        selfSkill: false,
        skills: {},
      })
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })

  it('fails without overwriting an existing manifest', () => {
    const project = createTempProject('init-existing')
    const manifestPath = path.join(project, 'skills.json')
    const originalManifest = '{"skills":{"existing":"local:*"}}\n'

    try {
      writeFileSync(manifestPath, originalManifest)

      const result = runSpm(['init', '--yes'], { cwd: project })

      expect(result.status).not.toBe(0)
      expect(readFileSync(manifestPath, 'utf8')).toBe(originalManifest)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

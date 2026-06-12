import { describe, expect, it } from '@rstest/core'
import {
  cleanupTempProject,
  createTempProject,
  formatProjectTerminalSnapshot,
  runSpm,
} from '../helpers/cli'

describe('spm help and version e2e', () => {
  it('prints top-level help from the built bin', () => {
    const project = createTempProject('help')

    try {
      const result = runSpm(['--help'], { cwd: project })

      expect(result.status).toBe(0)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })

  it('prints package version from the built bin', () => {
    const project = createTempProject('version')

    try {
      const result = runSpm(['--version'], { cwd: project })

      expect(result.status).toBe(0)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

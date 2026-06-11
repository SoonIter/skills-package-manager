import { describe, expect, it } from '@rstest/core'
import {
  cleanupTempProject,
  createTempProject,
  formatProjectTerminalSnapshot,
  runSpm,
} from '../helpers/cli'

describe('spm error e2e', () => {
  it('reports an unknown command', () => {
    const project = createTempProject('unknown-command')

    try {
      const result = runSpm(['unknown'], { cwd: project })

      expect(result.status).not.toBe(0)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })

  it('reports a missing add specifier', () => {
    const project = createTempProject('missing-add-specifier')

    try {
      const result = runSpm(['add'], { cwd: project })

      expect(result.status).not.toBe(0)
      expect(formatProjectTerminalSnapshot(result, project)).toMatchSnapshot()
    } finally {
      cleanupTempProject(project)
    }
  })
})

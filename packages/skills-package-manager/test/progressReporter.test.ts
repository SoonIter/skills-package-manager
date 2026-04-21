import { describe, expect, it } from '@rstest/core'
import { createInstallProgressReporter } from '../src/install/progressReporter'

describe('createInstallProgressReporter', () => {
  it('tracks resolved/reused/downloaded/added/installed counters and prints tty progress', () => {
    const writes: string[] = []
    const infos: string[] = []
    const reporter = createInstallProgressReporter({
      isTTY: true,
      write: (text) => {
        writes.push(text)
      },
      info: (text) => {
        infos.push(text)
      },
    })

    reporter.start(2)
    reporter.onProgress({ type: 'resolved', skillName: 'a' })
    reporter.onProgress({ type: 'resolved', skillName: 'b' })
    reporter.setPhase('fetching')
    reporter.onProgress({ type: 'reused', skillName: 'a' })
    reporter.onProgress({ type: 'added', skillName: 'a' })
    reporter.onProgress({ type: 'downloaded', skillName: 'b' })
    reporter.onProgress({ type: 'added', skillName: 'b' })
    reporter.setPhase('linking')
    reporter.onProgress({ type: 'installed', skillName: 'a' })
    reporter.onProgress({ type: 'installed', skillName: 'b' })
    reporter.complete()

    const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
    const combinedWrites = writes.join('')
    const stripped = combinedWrites.replace(ansiPattern, '')
    expect(combinedWrites).toContain('\r')
    expect(stripped).toContain('Progress: resolved 2, reused 1, downloaded 1, added 2')
    expect(stripped).toContain('done')
    expect(combinedWrites).toContain('\n')
    expect(infos).toHaveLength(0)
  })

  it('logs concise stage output in non-tty mode', () => {
    const infos: string[] = []
    const reporter = createInstallProgressReporter({
      isTTY: false,
      info: (text) => {
        infos.push(text)
      },
    })

    reporter.start(1)
    reporter.onProgress({ type: 'resolved', skillName: 'hello-skill' })
    reporter.setPhase('fetching')
    reporter.onProgress({ type: 'downloaded', skillName: 'hello-skill' })
    reporter.onProgress({ type: 'added', skillName: 'hello-skill' })
    reporter.setPhase('linking')
    reporter.onProgress({ type: 'installed', skillName: 'hello-skill' })
    reporter.setPhase('finalizing')
    reporter.complete()

    expect(infos).toContain('spm install: starting (1 skill)')
    expect(infos).toContain('spm install: resolving...')
    expect(infos).toContain('spm install: fetching...')
    expect(infos).toContain('spm install: linking...')
    expect(infos.at(-1)).toBe(
      'spm install: Progress: resolved 1, reused 0, downloaded 1, added 1, done',
    )
  })

  it('handles fetch skipped without increasing added counter', () => {
    const infos: string[] = []
    const reporter = createInstallProgressReporter({
      isTTY: false,
      info: (text) => {
        infos.push(text)
      },
    })

    reporter.start(1)
    reporter.onProgress({ type: 'resolved', skillName: 'hello-skill' })
    reporter.setPhase('fetching')
    reporter.setPhase('linking')
    reporter.onProgress({ type: 'installed', skillName: 'hello-skill' })
    reporter.complete()

    expect(infos.at(-1)).toBe(
      'spm install: Progress: resolved 1, reused 0, downloaded 0, added 0, done',
    )
  })
})

import { describe, expect, it } from '@rstest/core'
import { createInstallProgressReporter } from '../src/install/progressReporter'

describe('createInstallProgressReporter', () => {
  it('tracks resolved/added/installed counters and prints tty progress', () => {
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
    reporter.onProgress({ type: 'added', skillName: 'a' })
    reporter.onProgress({ type: 'added', skillName: 'b' })
    reporter.setPhase('linking')
    reporter.onProgress({ type: 'installed', skillName: 'a' })
    reporter.onProgress({ type: 'installed', skillName: 'b' })
    reporter.complete()

    const combinedWrites = writes.join('')
    expect(combinedWrites).toContain('\r')
    expect(combinedWrites).toContain('resolved 2/2, added 2/2, installed 2/2')
    expect(combinedWrites).toContain('\n')
    expect(infos.at(-1)).toBe('spm install: resolved 2/2, added 2/2, installed 2/2')
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
    reporter.onProgress({ type: 'added', skillName: 'hello-skill' })
    reporter.setPhase('linking')
    reporter.onProgress({ type: 'installed', skillName: 'hello-skill' })
    reporter.setPhase('finalizing')
    reporter.complete()

    expect(infos).toContain('spm install: starting (1 skills)')
    expect(infos).toContain('spm install: resolving...')
    expect(infos).toContain('spm install: fetching...')
    expect(infos).toContain('spm install: linking...')
    expect(infos.at(-1)).toBe('spm install: resolved 1/1, added 1/1, installed 1/1')
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

    expect(infos.at(-1)).toBe('spm install: resolved 1/1, added 0/1, installed 1/1')
  })
})

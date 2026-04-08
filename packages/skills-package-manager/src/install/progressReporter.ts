import type { InstallProgressEvent } from '../config/types'

type InstallPhase = 'resolving' | 'fetching' | 'linking' | 'finalizing' | 'done'

type ProgressSnapshot = {
  total: number
  resolved: number
  added: number
  installed: number
  phase: InstallPhase
  currentSkill?: string
}

type ProgressReporterOptions = {
  isTTY?: boolean
  write?: (text: string) => void
  info?: (text: string) => void
}

export type InstallProgressReporter = {
  start(total: number): void
  setPhase(phase: Exclude<InstallPhase, 'done'>): void
  onProgress(event: InstallProgressEvent): void
  complete(): void
  fail(): void
}

const phaseLabelMap: Record<InstallPhase, string> = {
  resolving: 'Resolving',
  fetching: 'Fetching',
  linking: 'Linking',
  finalizing: 'Finalizing',
  done: 'Done',
}

function clampCount(value: number, total: number): number {
  if (value < 0) return 0
  if (value > total) return total
  return value
}

function calculatePercent(snapshot: ProgressSnapshot): number {
  if (snapshot.phase === 'done') {
    return 100
  }

  if (snapshot.total === 0) {
    return 0
  }

  const maxSteps = snapshot.total * 3
  const completed = snapshot.resolved + snapshot.added + snapshot.installed
  return Math.floor((completed / maxSteps) * 100)
}

function formatSummary(snapshot: ProgressSnapshot): string {
  const total = snapshot.total
  return `resolved ${snapshot.resolved}/${total}, added ${snapshot.added}/${total}, installed ${snapshot.installed}/${total}`
}

function formatTTYLine(snapshot: ProgressSnapshot): string {
  const percent = calculatePercent(snapshot)
  const progress = Math.round((percent / 100) * 20)
  const filled = '='.repeat(progress)
  const empty = '-'.repeat(Math.max(0, 20 - progress))
  const phase = phaseLabelMap[snapshot.phase]
  const summary = formatSummary(snapshot)
  const skill = snapshot.currentSkill ? `, skill: ${snapshot.currentSkill}` : ''
  return `[${filled}${empty}] ${percent}% ${phase} ${summary}${skill}`
}

export function createInstallProgressReporter(
  options: ProgressReporterOptions = {},
): InstallProgressReporter {
  const write = options.write ?? ((text: string) => process.stderr.write(text))
  const info = options.info ?? ((text: string) => console.info(text))
  const useTTY = options.isTTY ?? process.stderr.isTTY === true

  const snapshot: ProgressSnapshot = {
    total: 0,
    resolved: 0,
    added: 0,
    installed: 0,
    phase: 'resolving',
  }

  let renderedTTY = false
  let lastLineLength = 0

  function renderTTY(): void {
    const line = formatTTYLine(snapshot)
    const clearPadding =
      lastLineLength > line.length ? ' '.repeat(lastLineLength - line.length) : ''
    write(`\r${line}${clearPadding}`)
    lastLineLength = line.length
    renderedTTY = true
  }

  function logStage(phase: Exclude<InstallPhase, 'done'>): void {
    info(`spm install: ${phaseLabelMap[phase].toLowerCase()}...`)
  }

  function render(): void {
    if (useTTY) {
      renderTTY()
      return
    }
  }

  return {
    start(total: number): void {
      snapshot.total = Math.max(0, total)
      snapshot.resolved = 0
      snapshot.added = 0
      snapshot.installed = 0
      snapshot.phase = 'resolving'
      snapshot.currentSkill = undefined

      if (useTTY) {
        renderTTY()
      } else {
        const noun = snapshot.total === 1 ? 'skill' : 'skills'
        info(`spm install: starting (${snapshot.total} ${noun})`)
        logStage('resolving')
      }
    },

    setPhase(phase: Exclude<InstallPhase, 'done'>): void {
      snapshot.phase = phase
      snapshot.currentSkill = undefined
      render()
      if (!useTTY && phase !== 'finalizing') {
        logStage(phase)
      }
    },

    onProgress(event: InstallProgressEvent): void {
      snapshot.currentSkill = event.skillName
      switch (event.type) {
        case 'resolved':
          snapshot.resolved = clampCount(snapshot.resolved + 1, snapshot.total)
          break
        case 'added':
          snapshot.added = clampCount(snapshot.added + 1, snapshot.total)
          break
        case 'installed':
          snapshot.installed = clampCount(snapshot.installed + 1, snapshot.total)
          break
        default: {
          const _exhaustive: never = event
          void _exhaustive
        }
      }
      render()
    },

    complete(): void {
      snapshot.phase = 'done'
      snapshot.currentSkill = undefined
      const summary = formatSummary(snapshot)

      if (useTTY) {
        renderTTY()
        write('\n')
      }

      info(`spm install: ${summary}`)
    },

    fail(): void {
      if (useTTY && renderedTTY) {
        write('\n')
      }
    },
  }
}

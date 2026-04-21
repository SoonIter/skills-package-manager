import pc from 'picocolors'
import type { InstallProgressEvent } from '../config/types'

type InstallPhase = 'resolving' | 'fetching' | 'linking' | 'finalizing' | 'done'

type ProgressSnapshot = {
  total: number
  resolved: number
  reused: number
  downloaded: number
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

const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

function stripAnsi(str: string): string {
  return str.replace(ansiPattern, '')
}

function formatProgressLine(snapshot: ProgressSnapshot, colorNum?: (n: string) => string): string {
  const num = colorNum ?? ((n: string) => n)
  const parts = [
    `resolved ${num(String(snapshot.resolved))}`,
    `reused ${num(String(snapshot.reused))}`,
    `downloaded ${num(String(snapshot.downloaded))}`,
    `added ${num(String(snapshot.added))}`,
  ]
  if (snapshot.phase === 'done') {
    parts.push('done')
  }
  return `Progress: ${parts.join(', ')}`
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
    reused: 0,
    downloaded: 0,
    added: 0,
    installed: 0,
    phase: 'resolving',
  }

  let renderedTTY = false
  let lastLineLength = 0

  function renderTTY(): void {
    const line = formatProgressLine(snapshot, pc.blue)
    const visibleLen = stripAnsi(line).length
    const clearPadding = lastLineLength > visibleLen ? ' '.repeat(lastLineLength - visibleLen) : ''
    write(`\r${line}${clearPadding}`)
    lastLineLength = visibleLen
    renderedTTY = true
  }

  function logStage(phase: Exclude<InstallPhase, 'done'>): void {
    info(`spm install: ${phaseLabelMap[phase].toLowerCase()}...`)
  }

  function render(): void {
    if (useTTY) {
      renderTTY()
    }
  }

  return {
    start(total: number): void {
      snapshot.total = Math.max(0, total)
      snapshot.resolved = 0
      snapshot.reused = 0
      snapshot.downloaded = 0
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
        case 'reused':
          snapshot.reused = clampCount(snapshot.reused + 1, snapshot.total)
          break
        case 'downloaded':
          snapshot.downloaded = clampCount(snapshot.downloaded + 1, snapshot.total)
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
      const line = formatProgressLine(snapshot)

      if (useTTY) {
        write(`\r${formatProgressLine(snapshot, pc.blue)}`)
        write('\n')
      } else {
        info(`spm install: ${line}`)
      }
    },

    fail(): void {
      if (useTTY && renderedTTY) {
        write('\n')
      }
    },
  }
}

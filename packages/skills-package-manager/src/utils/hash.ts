import { createHash } from 'node:crypto'

export function sha256(content: Parameters<ReturnType<typeof createHash>['update']>[0]): string {
  return `sha256-${createHash('sha256').update(content).digest('hex')}`
}

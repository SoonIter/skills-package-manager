import type { InstallProgressEvent } from '../config/types'
import type { FetchResult, LinkResult, PipelineBus, PipelineResult, ResolveResult } from './types'

export function createPipelineBus(onProgress?: (event: InstallProgressEvent) => void): PipelineBus {
  const resolved: ResolveResult[] = []
  const fetched: FetchResult[] = []
  const linked: LinkResult[] = []

  return {
    emitResolved(result: ResolveResult) {
      resolved.push(result)
      onProgress?.({ type: 'resolved', skillName: result.skillName })
    },

    emitFetched(result: FetchResult) {
      fetched.push(result)
      onProgress?.({ type: 'added', skillName: result.skillName })
    },

    emitLinked(result: LinkResult) {
      linked.push(result)
      onProgress?.({ type: 'installed', skillName: result.skillName })
    },

    onProgress(event: InstallProgressEvent) {
      onProgress?.(event)
    },

    getResults(): PipelineResult {
      return { resolved, fetched, linked }
    },
  }
}

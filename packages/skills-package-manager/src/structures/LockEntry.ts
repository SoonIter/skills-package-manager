import { Resolution } from './Resolution'
import type { LockEntryData, LockEntryPatchData } from './types'

export class LockEntry {
  readonly specifier: string
  readonly resolution: Resolution
  readonly digest: string
  readonly patch?: LockEntryPatchData

  constructor(data: LockEntryData) {
    this.specifier = data.specifier
    this.resolution = Resolution.from(data.resolution)
    this.digest = data.digest
    this.patch = data.patch ? { ...data.patch } : undefined
  }

  withPatch(patch: LockEntryPatchData | undefined): LockEntry {
    return new LockEntry({
      ...this.toJSON(),
      ...(patch ? { patch } : {}),
    })
  }

  withoutPatch(): LockEntry {
    return new LockEntry({
      specifier: this.specifier,
      resolution: this.resolution.toJSON(),
      digest: this.digest,
    })
  }

  toJSON(): LockEntryData {
    return {
      specifier: this.specifier,
      resolution: this.resolution.toJSON(),
      digest: this.digest,
      ...(this.patch ? { patch: { ...this.patch } } : {}),
    }
  }
}

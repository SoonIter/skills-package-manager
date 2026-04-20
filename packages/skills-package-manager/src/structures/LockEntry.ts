import { Resolution } from './Resolution'
import { Specifier } from './Specifier'
import type { LockEntryData, LockEntryPatchData } from './types'

export class LockEntry {
  readonly specifier: string
  readonly resolution: Resolution
  readonly digest: string
  readonly patch?: LockEntryPatchData
  private _parsedSpecifier?: Specifier

  constructor(data: LockEntryData) {
    this.specifier = data.specifier
    this.resolution = Resolution.from(data.resolution)
    this.digest = data.digest
    this.patch = data.patch ? { ...data.patch } : undefined
  }

  get parsedSpecifier(): Specifier {
    if (!this._parsedSpecifier) {
      this._parsedSpecifier = Specifier.parse(this.specifier)
    }
    return this._parsedSpecifier
  }

  withPatch(patch: LockEntryPatchData | undefined): LockEntry {
    if (!patch) {
      return this
    }
    return new LockEntry({
      ...this.toJSON(),
      patch,
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

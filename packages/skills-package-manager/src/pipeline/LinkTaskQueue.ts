import type { InstallProgressListener } from '../config/types'
import { linkSkill } from '../install/links'
import type { Manifest } from '../structures/Manifest'
import type { FetchedSkill } from './FetchQueue'

export type LinkedSkill = {
  skillName: string
}

export class LinkTaskQueue {
  async run(options: {
    rootDir: string
    manifest: Manifest
    fetched: FetchedSkill[]
    onProgress?: InstallProgressListener
  }): Promise<LinkedSkill[]> {
    const normalizedManifest = options.manifest.normalize()
    const linked: LinkedSkill[] = []

    for (const { skillName, installDir } of options.fetched) {
      for (const linkTarget of normalizedManifest.linkTargets) {
        await linkSkill(options.rootDir, installDir, linkTarget, skillName)
      }

      options.onProgress?.({ type: 'installed', skillName })
      linked.push({ skillName })
    }

    return linked
  }
}

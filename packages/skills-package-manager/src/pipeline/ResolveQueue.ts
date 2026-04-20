import path from 'node:path'
import type { InstallProgressListener } from '../config/types'
import type { NpmConfig } from '../npm/config'
import { FileResolver } from '../resolvers/FileResolver'
import { GitResolver } from '../resolvers/GitResolver'
import { LinkResolver } from '../resolvers/LinkResolver'
import { NpmResolver } from '../resolvers/NpmResolver'
import { ResolverRegistry } from '../resolvers/ResolverRegistry'
import type { LockEntry } from '../structures/LockEntry'
import { Lockfile } from '../structures/Lockfile'
import type { Manifest } from '../structures/Manifest'
import { Specifier } from '../structures/Specifier'
import { sha256File } from '../utils/hash'
import { toPortableRelativePath } from '../utils/path'

export class ResolveQueue {
  constructor(
    readonly registry = new ResolverRegistry([
      new LinkResolver(),
      new FileResolver(),
      new GitResolver(),
      new NpmResolver(),
    ]),
  ) {}

  async attachManifestPatch(
    rootDir: string,
    manifest: Manifest,
    skillName: string,
    entry: LockEntry,
  ): Promise<LockEntry> {
    const patchPath = manifest.normalize().patchedSkills?.[skillName]
    if (!patchPath) {
      return entry
    }

    const absolutePatchPath = path.resolve(rootDir, patchPath)
    return entry.withPatch({
      path: toPortableRelativePath(rootDir, absolutePatchPath),
      digest: await sha256File(absolutePatchPath),
    })
  }

  async resolveSkill(
    rootDir: string,
    manifest: Manifest,
    skillName: string,
    specifier: string,
    npmConfig?: NpmConfig,
  ): Promise<{ skillName: string; entry: LockEntry }> {
    const parsedSpecifier = Specifier.parse(specifier)
    const resolvedSkillName = skillName || parsedSpecifier.skillName
    const entry = await this.registry.resolve(parsedSpecifier, {
      rootDir,
      skillName: resolvedSkillName,
      npmConfig,
    })
    return {
      skillName: resolvedSkillName,
      entry: await this.attachManifestPatch(rootDir, manifest, resolvedSkillName, entry),
    }
  }

  async syncLockfile(options: {
    rootDir: string
    manifest: Manifest
    currentLock: Lockfile | null
    onProgress?: InstallProgressListener
    npmConfig?: NpmConfig
  }): Promise<Lockfile> {
    const normalizedManifest = options.manifest.normalize()
    const entries = await Promise.all(
      Object.entries(normalizedManifest.skills).map(async ([skillName, specifier]) => {
        const resolved = await this.resolveSkill(
          options.rootDir,
          options.manifest,
          skillName,
          specifier,
          options.npmConfig,
        )
        options.onProgress?.({ type: 'resolved', skillName: resolved.skillName })
        return [resolved.skillName, resolved.entry.toJSON()] as const
      }),
    )

    return Lockfile.from({
      lockfileVersion: '0.1',
      installDir: normalizedManifest.installDir,
      linkTargets: normalizedManifest.linkTargets,
      skills: Object.fromEntries(entries),
    })
  }

  async ensureBaseLockfile(options: {
    rootDir: string
    manifest: Manifest
    currentLock: Lockfile | null
    onProgress?: InstallProgressListener
    npmConfig?: NpmConfig
  }): Promise<Lockfile> {
    if (
      options.currentLock &&
      (await options.currentLock.isInSyncWith(options.manifest, options.rootDir))
    ) {
      return options.currentLock.clone()
    }

    return this.syncLockfile(options)
  }

  async syncSelectedSkills(options: {
    rootDir: string
    manifest: Manifest
    currentLock: Lockfile | null
    skillNames: string[]
    onProgress?: InstallProgressListener
    npmConfig?: NpmConfig
  }): Promise<Lockfile> {
    let nextLock = options.currentLock
      ? options.currentLock.clone()
      : Lockfile.empty(options.manifest)
    nextLock = nextLock.withManifest(options.manifest)

    const resolutions = await Promise.all(
      options.skillNames.map(async (skillName) => {
        const specifier = options.manifest.getSkillSpecifier(skillName)
        if (!specifier) {
          return null
        }
        const resolved = await this.resolveSkill(
          options.rootDir,
          options.manifest,
          skillName,
          specifier,
          options.npmConfig,
        )
        options.onProgress?.({ type: 'resolved', skillName: resolved.skillName })
        return resolved
      }),
    )

    for (const resolved of resolutions) {
      if (resolved) {
        nextLock = nextLock.withEntry(resolved.skillName, resolved.entry)
      }
    }

    return nextLock
  }

  async createRuntimeLockfile(options: {
    rootDir: string
    manifest: Manifest
    lockfile: Lockfile
    npmConfig?: NpmConfig
  }): Promise<Lockfile> {
    const runtimeManifest = options.manifest.withBundledSelfSkill()
    let runtimeLock = options.lockfile.withManifest(runtimeManifest)

    const skillsToResolve = Object.entries(runtimeManifest.normalize().skills).filter(
      ([skillName]) => !runtimeLock.getEntry(skillName),
    )

    const resolutions = await Promise.all(
      skillsToResolve.map(async ([skillName, specifier]) =>
        this.resolveSkill(
          options.rootDir,
          runtimeManifest,
          skillName,
          specifier,
          options.npmConfig,
        ),
      ),
    )

    for (const resolved of resolutions) {
      runtimeLock = runtimeLock.withEntry(resolved.skillName, resolved.entry)
    }

    return runtimeLock
  }
}

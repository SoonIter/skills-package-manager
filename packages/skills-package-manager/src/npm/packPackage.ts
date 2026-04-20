import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import semver from 'semver'
import {
  createRequestHeaders,
  type NpmConfig,
  readNpmConfig,
  resolveRegistryConfig,
} from './config'

export type ResolvedNpmPackage = {
  name: string
  version: string
  tarballUrl: string
  integrity?: string
  registry: string
}

type RegistryPackageMetadata = {
  'dist-tags'?: Record<string, string>
  versions?: Record<
    string,
    {
      name?: string
      version?: string
      dist?: {
        tarball?: string
        integrity?: string
      }
    }
  >
}

const resolvedNpmPackageCache = new Map<string, Promise<ResolvedNpmPackage>>()

function parseRegistryPackageSpecifier(specifier: string): {
  packageName: string
  requestedVersion: string | null
} {
  const scopedMatch = specifier.match(/^(@[^/]+\/[^@]+)(?:@(.+))?$/)
  if (scopedMatch) {
    return {
      packageName: scopedMatch[1],
      requestedVersion: scopedMatch[2] ?? null,
    }
  }

  const unscopedMatch = specifier.match(/^([^@/:][^@]*?)(?:@(.+))?$/)
  if (unscopedMatch) {
    return {
      packageName: unscopedMatch[1],
      requestedVersion: unscopedMatch[2] ?? null,
    }
  }

  throw new Error(`Unsupported npm specifier: ${specifier}`)
}

function resolveVersionFromMetadata(
  metadata: RegistryPackageMetadata,
  requestedVersion: string | null,
): string {
  const versions = metadata.versions ?? {}
  const versionKeys = Object.keys(versions)
  const requested = requestedVersion ?? 'latest'

  const taggedVersion = metadata['dist-tags']?.[requested]
  if (taggedVersion && versions[taggedVersion]) {
    return taggedVersion
  }

  if (semver.valid(requested) && versions[requested]) {
    return requested
  }

  const matched = semver.maxSatisfying(versionKeys, requested)
  if (matched) {
    return matched
  }

  throw new Error(`Unable to resolve npm version "${requested}"`)
}

async function resolveNpmPackageUncached(
  cwd: string,
  specifier: string,
  config?: NpmConfig,
): Promise<ResolvedNpmPackage> {
  const npmConfig = config ?? (await readNpmConfig(cwd))
  const { packageName, requestedVersion } = parseRegistryPackageSpecifier(specifier)
  const registry = resolveRegistryConfig(npmConfig, packageName)
  const metadataUrl = new URL(encodeURIComponent(packageName), registry)
  const response = await fetch(metadataUrl, {
    headers: createRequestHeaders(npmConfig, metadataUrl.toString()),
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch npm metadata for ${packageName}: ${response.status}`)
  }

  const metadata = (await response.json()) as RegistryPackageMetadata
  const version = resolveVersionFromMetadata(metadata, requestedVersion)
  const manifest = metadata.versions?.[version]
  const tarballUrl = manifest?.dist?.tarball

  if (!manifest?.name || !manifest.version || !tarballUrl) {
    throw new Error(`Invalid npm metadata for ${packageName}@${version}`)
  }

  return {
    name: manifest.name,
    version: manifest.version,
    tarballUrl,
    integrity: manifest.dist?.integrity,
    registry,
  }
}

export async function resolveNpmPackage(
  cwd: string,
  specifier: string,
  config?: NpmConfig,
): Promise<ResolvedNpmPackage> {
  const cacheKey = `${path.resolve(cwd)}\0${specifier}`
  const cached = resolvedNpmPackageCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending = resolveNpmPackageUncached(cwd, specifier, config)
  resolvedNpmPackageCache.set(cacheKey, pending)

  try {
    return await pending
  } catch (error) {
    resolvedNpmPackageCache.delete(cacheKey)
    throw error
  }
}

function verifyIntegrity(buffer: Buffer, integrity: string): boolean {
  for (const entry of integrity.split(/\s+/).filter(Boolean)) {
    const separatorIndex = entry.indexOf('-')
    if (separatorIndex <= 0) {
      continue
    }

    const algorithm = entry.slice(0, separatorIndex)
    const expectedDigest = entry.slice(separatorIndex + 1)

    try {
      const actualDigest = createHash(algorithm).update(buffer).digest('base64')
      if (actualDigest === expectedDigest) {
        return true
      }
    } catch {}
  }

  return false
}

export async function downloadNpmPackageTarball(
  cwd: string,
  tarballUrl: string,
  expectedIntegrity?: string,
  config?: NpmConfig,
): Promise<string> {
  const downloadRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-npm-download-'))

  try {
    const npmConfig = config ?? (await readNpmConfig(cwd))
    const response = await fetch(tarballUrl, {
      headers: createRequestHeaders(npmConfig, tarballUrl),
    })
    if (!response.ok) {
      throw new Error(`Failed to download npm tarball: ${response.status}`)
    }

    const tarballBuffer = Buffer.from(await response.arrayBuffer())
    if (expectedIntegrity && !verifyIntegrity(tarballBuffer, expectedIntegrity)) {
      throw new Error(`Integrity check failed for npm tarball ${tarballUrl}`)
    }

    const tarballPath = path.join(
      downloadRoot,
      path.basename(new URL(tarballUrl).pathname) || 'package.tgz',
    )
    await writeFile(tarballPath, tarballBuffer)
    return tarballPath
  } catch (error) {
    await rm(downloadRoot, { recursive: true, force: true }).catch(() => {})
    throw new Error(`Failed to download npm tarball ${tarballUrl}: ${(error as Error).message}`, {
      cause: error as Error,
    })
  }
}

export async function cleanupPackedNpmPackage(tarballPath: string): Promise<void> {
  await rm(path.dirname(tarballPath), { recursive: true, force: true }).catch(() => {})
}

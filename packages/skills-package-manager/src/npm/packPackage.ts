import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import semver from 'semver'

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

export type NpmConfig = {
  settings: Map<string, string>
  authEntries: RegistryAuthEntry[]
}

export type RegistryAuthEntry = {
  prefix: string
  authorization: string
}

const resolvedNpmPackageCache = new Map<string, Promise<ResolvedNpmPackage>>()

function normalizeRegistryUrl(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, key) => process.env[key] ?? '')
}

async function readNpmRc(filePath: string): Promise<Map<string, string>> {
  try {
    const content = await readFile(filePath, 'utf8')
    const entries = new Map<string, string>()

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#') || line.startsWith(';')) {
        continue
      }

      const separator = line.indexOf('=')
      if (separator < 0) {
        continue
      }

      entries.set(line.slice(0, separator).trim(), interpolateEnv(line.slice(separator + 1).trim()))
    }

    return entries
  } catch {
    return new Map()
  }
}

function getCandidateDirs(cwd: string): string[] {
  const resolvedCwd = path.resolve(cwd)

  if (process.platform === 'win32') {
    const parsed = path.parse(resolvedCwd)
    const relative = resolvedCwd.slice(parsed.root.length)
    const parts = relative.split(path.sep).filter(Boolean)
    return [
      parsed.root,
      ...parts.map((_part, index) => path.join(parsed.root, ...parts.slice(0, index + 1))),
    ]
  }

  const parts = resolvedCwd.split(path.sep).filter(Boolean)
  return ['/', ...parts.map((_part, index) => path.join('/', ...parts.slice(0, index + 1)))]
}

function buildRegistryAuthEntries(settings: Map<string, string>): RegistryAuthEntry[] {
  const registryAuthConfigs = new Map<
    string,
    {
      authToken?: string
      auth?: string
      username?: string
      password?: string
    }
  >()

  for (const [key, value] of settings) {
    const match = key.match(/^(\/\/.+\/):(_authToken|_auth|username|_password)$/)
    if (!match) {
      continue
    }

    const [, prefix, field] = match
    const config = registryAuthConfigs.get(prefix) ?? {}
    registryAuthConfigs.set(prefix, {
      ...config,
      [field === '_authToken'
        ? 'authToken'
        : field === '_auth'
          ? 'auth'
          : field === 'username'
            ? 'username'
            : 'password']: value,
    })
  }

  return [...registryAuthConfigs.entries()]
    .map(([prefix, config]) => {
      if (config.authToken) {
        return {
          prefix,
          authorization: `Bearer ${config.authToken}`,
        }
      }

      if (config.auth) {
        return {
          prefix,
          authorization: `Basic ${config.auth}`,
        }
      }

      if (config.username && config.password) {
        const decodedPassword = Buffer.from(config.password, 'base64').toString('utf8')
        return {
          prefix,
          authorization: `Basic ${Buffer.from(`${config.username}:${decodedPassword}`).toString(
            'base64',
          )}`,
        }
      }

      return null
    })
    .filter((entry): entry is RegistryAuthEntry => entry !== null)
    .sort((a, b) => b.prefix.length - a.prefix.length)
}

export async function loadNpmConfig(cwd: string): Promise<NpmConfig> {
  const configs = new Map<string, string>()

  for (const [key, value] of await readNpmRc(path.join(homedir(), '.npmrc'))) {
    configs.set(key, value)
  }

  for (const candidateDir of getCandidateDirs(cwd)) {
    for (const [key, value] of await readNpmRc(path.join(candidateDir, '.npmrc'))) {
      configs.set(key, value)
    }
  }

  return {
    settings: configs,
    authEntries: buildRegistryAuthEntries(configs),
  }
}

function resolveRegistryConfig(config: NpmConfig, packageName: string): string {
  const scopeMatch = packageName.match(/^(@[^/]+)\//)
  if (scopeMatch) {
    const scopeRegistry = config.settings.get(`${scopeMatch[1]}:registry`)
    if (scopeRegistry) {
      return normalizeRegistryUrl(scopeRegistry)
    }
  }

  return normalizeRegistryUrl(config.settings.get('registry') ?? 'https://registry.npmjs.org/')
}

function resolveAuthorizationHeader(config: NpmConfig, requestUrl: string): string | undefined {
  const url = new URL(requestUrl)
  const requestKey = `//${url.host}${url.pathname}`
  const matched = config.authEntries.find((entry) => requestKey.startsWith(entry.prefix))
  return matched?.authorization
}

function createRequestHeaders(config: NpmConfig, requestUrl: string): HeadersInit | undefined {
  const authorization = resolveAuthorizationHeader(config, requestUrl)
  if (!authorization) {
    return undefined
  }

  return { authorization }
}

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
): Promise<ResolvedNpmPackage> {
  const config = await loadNpmConfig(cwd)
  const { packageName, requestedVersion } = parseRegistryPackageSpecifier(specifier)
  const registry = resolveRegistryConfig(config, packageName)
  const metadataUrl = new URL(encodeURIComponent(packageName), registry)
  const response = await fetch(metadataUrl, {
    headers: createRequestHeaders(config, metadataUrl.toString()),
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
): Promise<ResolvedNpmPackage> {
  const cacheKey = `${path.resolve(cwd)}\0${specifier}`
  const cached = resolvedNpmPackageCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const pending = resolveNpmPackageUncached(cwd, specifier)
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
): Promise<string> {
  const downloadRoot = await mkdtemp(path.join(tmpdir(), 'skills-pm-npm-download-'))

  try {
    const config = await loadNpmConfig(cwd)
    const response = await fetch(tarballUrl, {
      headers: createRequestHeaders(config, tarballUrl),
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

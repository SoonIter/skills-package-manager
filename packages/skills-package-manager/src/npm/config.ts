import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export type RegistryAuthEntry = {
  prefix: string
  authorization: string
}

export type NpmConfig = {
  settings: Map<string, string>
  authEntries: RegistryAuthEntry[]
}

export type NormalizedNpmConfig = {
  settings: Record<string, string>
  authEntries: RegistryAuthEntry[]
}

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
    const fieldMap: Record<string, 'authToken' | 'auth' | 'username' | 'password'> = {
      _authToken: 'authToken',
      _auth: 'auth',
      username: 'username',
      _password: 'password',
    }
    const mappedField = fieldMap[field]
    if (mappedField) {
      registryAuthConfigs.set(prefix, {
        ...config,
        [mappedField]: value,
      })
    }
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

export async function readNpmConfig(cwd: string): Promise<NpmConfig> {
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

export function normalizeNpmConfig(config: NpmConfig): NormalizedNpmConfig {
  return {
    settings: Object.fromEntries(config.settings),
    authEntries: [...config.authEntries],
  }
}

export function resolveRegistryConfig(config: NpmConfig, packageName: string): string {
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

export function createRequestHeaders(
  config: NpmConfig,
  requestUrl: string,
): HeadersInit | undefined {
  const authorization = resolveAuthorizationHeader(config, requestUrl)
  if (!authorization) {
    return undefined
  }

  return { authorization }
}

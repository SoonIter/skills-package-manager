import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

const CACHE_DIR_NAME = 'skills-pm'
const STALE_LOCK_MS = 10 * 60 * 1000
const STALE_TMP_MS = 24 * 60 * 60 * 1000
const LOCK_POLL_MS = 100

type CachePaths = {
  rootDir: string
  reposDir: string
  npmMetadataDir: string
  tarballsDir: string
  locksDir: string
  tmpDir: string
}

const cacheInitPromises = new Map<string, Promise<CachePaths>>()

function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function resolveDefaultCacheRoot(): string {
  if (process.env.SPM_CACHE_DIR) {
    return path.resolve(process.env.SPM_CACHE_DIR)
  }

  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Caches', CACHE_DIR_NAME)
  }

  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local'),
      CACHE_DIR_NAME,
    )
  }

  return path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'), CACHE_DIR_NAME)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function cleanupDirectoryEntries(
  dirPath: string,
  maxAgeMs: number,
  remover: (entryPath: string) => Promise<void>,
): Promise<void> {
  const now = Date.now()

  for (const entry of await readdir(dirPath, { withFileTypes: true }).catch(() => [])) {
    const entryPath = path.join(dirPath, entry.name)

    try {
      const entryStat = await stat(entryPath)
      if (now - entryStat.mtimeMs <= maxAgeMs) {
        continue
      }
    } catch {
      continue
    }

    await remover(entryPath).catch(() => {})
  }
}

async function initializeCache(rootDir: string): Promise<CachePaths> {
  const cache: CachePaths = {
    rootDir,
    reposDir: path.join(rootDir, 'repos'),
    npmMetadataDir: path.join(rootDir, 'npm-metadata'),
    tarballsDir: path.join(rootDir, 'tarballs'),
    locksDir: path.join(rootDir, 'locks'),
    tmpDir: path.join(rootDir, 'tmp'),
  }

  await mkdir(cache.rootDir, { recursive: true })
  await Promise.all([
    mkdir(cache.reposDir, { recursive: true }),
    mkdir(cache.npmMetadataDir, { recursive: true }),
    mkdir(cache.tarballsDir, { recursive: true }),
    mkdir(cache.locksDir, { recursive: true }),
    mkdir(cache.tmpDir, { recursive: true }),
  ])

  await cleanupDirectoryEntries(cache.tmpDir, STALE_TMP_MS, async (entryPath) => {
    await rm(entryPath, { recursive: true, force: true })
  })
  await cleanupDirectoryEntries(cache.locksDir, STALE_LOCK_MS, async (entryPath) => {
    await rm(entryPath, { recursive: true, force: true })
  })

  return cache
}

export async function getCachePaths(): Promise<CachePaths> {
  const rootDir = resolveDefaultCacheRoot()
  const cached = cacheInitPromises.get(rootDir)
  if (cached) {
    return cached
  }

  const pending = initializeCache(rootDir)
  cacheInitPromises.set(rootDir, pending)

  try {
    return await pending
  } catch (error) {
    cacheInitPromises.delete(rootDir)
    throw error
  }
}

export function getCacheKeyPath(dirPath: string, key: string, extension = ''): string {
  return path.join(dirPath, `${hashKey(key)}${extension}`)
}

export async function createCacheTempDir(prefix: string): Promise<string> {
  const cache = await getCachePaths()
  return mkdtemp(path.join(cache.tmpDir, prefix))
}

async function writeLockOwnerFile(lockDir: string): Promise<void> {
  await writeFile(
    path.join(lockDir, 'owner.json'),
    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }, null, 2),
    'utf8',
  ).catch(() => {})
}

async function acquireLock(lockDir: string): Promise<void> {
  while (true) {
    try {
      await mkdir(lockDir)
      await writeLockOwnerFile(lockDir)
      return
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'EEXIST') {
        throw error
      }

      try {
        const lockStat = await stat(lockDir)
        if (Date.now() - lockStat.mtimeMs > STALE_LOCK_MS) {
          await rm(lockDir, { recursive: true, force: true }).catch(() => {})
          continue
        }
      } catch {
        continue
      }

      await sleep(LOCK_POLL_MS)
    }
  }
}

export async function withCacheLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cache = await getCachePaths()
  const lockDir = getCacheKeyPath(cache.locksDir, key, '.lock')
  await acquireLock(lockDir)

  try {
    return await fn()
  } finally {
    await rm(lockDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function readJsonCacheFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

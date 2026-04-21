import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { CacheManager } from './types'

const CACHE_DIR = '.skills-pm-cache'

export function createFileSystemCache(cwd: string): CacheManager {
  const cacheRoot = path.join(cwd, CACHE_DIR)

  async function ensureCache() {
    await mkdir(cacheRoot, { recursive: true })
  }

  function cachePath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex')
    return path.join(cacheRoot, hash.slice(0, 2), hash.slice(2))
  }

  return {
    async get(key: string): Promise<string | null> {
      const cp = cachePath(key)
      try {
        const content = await readFile(cp, 'utf8')
        return content
      } catch {
        return null
      }
    },

    async set(key: string, value: string): Promise<void> {
      await ensureCache()
      const cp = cachePath(key)
      await mkdir(path.dirname(cp), { recursive: true })
      await writeFile(cp, value, 'utf8')
    },

    async getOrSet<T extends string>(key: string, factory: () => Promise<T>): Promise<T> {
      const cached = await this.get(key)
      if (cached !== null) {
        return cached as T
      }
      const value = await factory()
      await this.set(key, value)
      return value
    },
  }
}

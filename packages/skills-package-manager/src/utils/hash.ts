import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, readlink } from 'node:fs/promises'
import path from 'node:path'

export function sha256(content: Parameters<ReturnType<typeof createHash>['update']>[0]): string {
  return `sha256-${createHash('sha256').update(content).digest('hex')}`
}

async function hashDirectoryEntry(
  hash: ReturnType<typeof createHash>,
  rootDir: string,
  currentDir: string,
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name)
    const relativePath = path.relative(rootDir, absolutePath).replace(/\\/g, '/')
    const stats = await lstat(absolutePath)

    if (stats.isSymbolicLink()) {
      hash.update(`symlink:${relativePath}\n`)
      hash.update(await readlink(absolutePath))
      hash.update('\n')
      continue
    }

    if (stats.isDirectory()) {
      hash.update(`dir:${relativePath}\n`)
      await hashDirectoryEntry(hash, rootDir, absolutePath)
      continue
    }

    hash.update(`file:${relativePath}\n`)
    hash.update(await readFile(absolutePath))
    hash.update('\n')
  }
}

export async function sha256Directory(rootDir: string): Promise<string> {
  const hash = createHash('sha256')
  await hashDirectoryEntry(hash, rootDir, rootDir)
  return `sha256-${hash.digest('hex')}`
}

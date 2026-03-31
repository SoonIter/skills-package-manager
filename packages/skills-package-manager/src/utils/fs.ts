import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function replaceDir(from: string, to: string): Promise<void> {
  await rm(to, { recursive: true, force: true })
  await cp(from, to, { recursive: true })
}

export async function replaceSymlink(target: string, linkPath: string): Promise<void> {
  await rm(linkPath, { recursive: true, force: true })
  await symlink(target, linkPath)
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

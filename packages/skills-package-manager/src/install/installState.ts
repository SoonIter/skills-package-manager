import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, writeJson } from '../utils/fs'

export async function readInstallState(rootDir: string) {
  const filePath = path.join(rootDir, '.agents/skills/.skills-pm-install-state.json')

  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

export async function writeInstallState(rootDir: string, value: unknown) {
  const dirPath = path.join(rootDir, '.agents/skills')
  await ensureDir(dirPath)
  const filePath = path.join(dirPath, '.skills-pm-install-state.json')
  await writeJson(filePath, value)
}

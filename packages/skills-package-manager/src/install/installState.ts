import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, writeJson } from '../utils/fs'

const INSTALL_STATE_FILE = '.skills-pm-install-state.json'

export async function readInstallState(rootDir: string, installDir: string) {
  const filePath = path.join(rootDir, installDir, INSTALL_STATE_FILE)

  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

export async function writeInstallState(rootDir: string, installDir: string, value: unknown) {
  const dirPath = path.join(rootDir, installDir)
  await ensureDir(dirPath)
  const filePath = path.join(dirPath, INSTALL_STATE_FILE)
  await writeJson(filePath, value)
}

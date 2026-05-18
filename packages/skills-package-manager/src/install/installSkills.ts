import { installCommand } from '../commands/install'
import type { InstallProgressListener } from '../config/types'

export async function installSkills(
  rootDir: string,
  options?: { onProgress?: InstallProgressListener },
) {
  return installCommand({ cwd: rootDir, onProgress: options?.onProgress })
}

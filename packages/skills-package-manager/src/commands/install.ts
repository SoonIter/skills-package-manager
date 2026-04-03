import type { InstallCommandOptions } from '../config/types'
import { installSkills } from '../install/installSkills'

export async function installCommand(options: InstallCommandOptions) {
  return installSkills(options.cwd, { frozenLockfile: options.frozenLockfile })
}

import { installSkills } from '../install/installSkills'
import type { InstallCommandOptions } from '../config/types'

export async function installCommand(options: InstallCommandOptions) {
  return installSkills(options.cwd, { frozenLockfile: options.frozenLockfile })
}

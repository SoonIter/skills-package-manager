import { installSkills } from '../install/installSkills'

export async function installCommand(options: { cwd: string; frozenLockfile?: boolean }) {
  return installSkills(options.cwd, { frozenLockfile: options.frozenLockfile })
}

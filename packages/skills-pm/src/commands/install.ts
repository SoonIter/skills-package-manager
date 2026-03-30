import { installSkills } from '../install/installSkills'

export async function installCommand(options: { cwd: string }) {
  return installSkills(options.cwd)
}

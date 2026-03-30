import { installCommand } from 'skills-pm'

export async function preResolution(
  options: { lockfileDir?: string; workspaceRoot?: string } = {},
) {
  const lockfileDir = options.lockfileDir
  if (!lockfileDir) {
    return undefined
  }

  await installCommand({ cwd: lockfileDir })
  return undefined
}

import { installCommand } from 'skills-package-manager'

export async function preResolution(
  options: { lockfileDir?: string; workspaceRoot?: string } = {},
) {
  const projectRoot = options.lockfileDir
  if (!projectRoot) {
    return undefined
  }

  await installCommand({ cwd: projectRoot })
  return undefined
}

export function afterAllResolved(
  pnpmLockfile: Record<string, unknown>,
  _context: { log?: (message: string) => void } = {},
) {
  return pnpmLockfile
}

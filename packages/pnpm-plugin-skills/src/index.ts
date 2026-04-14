import { installCommand } from 'skills-package-manager'

type PluginSettings = {
  pnpmPlugin?: {
    removePnpmFileCheckSum?: boolean
  }
}

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

export function afterAllResolved(
  lockfile: Record<string, unknown>,
  context: { config?: PluginSettings } = {},
) {
  if (context.config?.pnpmPlugin?.removePnpmFileCheckSum !== true) {
    return lockfile
  }

  if ('pnpmfileChecksum' in lockfile) {
    delete lockfile.pnpmfileChecksum
  }

  return lockfile
}

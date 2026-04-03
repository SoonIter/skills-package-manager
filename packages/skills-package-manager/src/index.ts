// Commands
export { addCommand } from './commands/add'
export { initCommand } from './commands/init'
export { installCommand } from './commands/install'
export { updateCommand } from './commands/update'

// CLI
export { runCli } from './cli/runCli'

// Config
export { resolveLockEntry } from './config/syncSkillsLock'
export { isLockInSync } from './config/compareSkillsLock'
export { readSkillsManifest } from './config/readSkillsManifest'
export { readSkillsLock } from './config/readSkillsLock'
export { writeSkillsManifest } from './config/writeSkillsManifest'
export { writeSkillsLock } from './config/writeSkillsLock'
export type {
  SkillsManifest,
  SkillsLock,
  SkillsLockEntry,
  NormalizedSpecifier,
  AddCommandOptions,
  InitCommandOptions,
  InstallCommandOptions,
  UpdateCommandOptions,
  UpdateCommandResult,
} from './config/types'

// Install
export { fetchSkillsFromLock, installSkills, installStageHooks, linkSkillsFromLock } from './install/installSkills'

// GitHub
export { listRepoSkills, cloneAndDiscover, discoverSkillsInDir, parseOwnerRepo, parseGitHubUrl } from './github/listSkills'
export type { SkillInfo } from './github/types'

// Specifiers
export { normalizeSpecifier } from './specifiers/normalizeSpecifier'
export { parseSpecifier } from './specifiers/parseSpecifier'

// Errors
export {
  ErrorCode,
  SpmError,
  FileSystemError,
  GitError,
  ManifestError,
  NetworkError,
  ParseError,
  SkillError,
  convertNodeError,
  formatErrorForDisplay,
  isSpmError,
  getExitCode,
} from './errors'

// Commands

// CLI
export { runCli } from './cli/runCli'
export { addCommand } from './commands/add'
export { initCommand } from './commands/init'
export { installCommand } from './commands/install'
export { updateCommand } from './commands/update'
export { isLockInSync } from './config/compareSkillsLock'
export { readSkillsLock } from './config/readSkillsLock'
export { readSkillsManifest } from './config/readSkillsManifest'
// Config
export { resolveLockEntry } from './config/syncSkillsLock'
export type {
  AddCommandOptions,
  InitCommandOptions,
  InstallCommandOptions,
  NormalizedSpecifier,
  SkillsLock,
  SkillsLockEntry,
  SkillsManifest,
  UpdateCommandOptions,
  UpdateCommandResult,
} from './config/types'
export { writeSkillsLock } from './config/writeSkillsLock'
export { writeSkillsManifest } from './config/writeSkillsManifest'
// Errors
export {
  convertNodeError,
  ErrorCode,
  FileSystemError,
  formatErrorForDisplay,
  GitError,
  getExitCode,
  isSpmError,
  ManifestError,
  NetworkError,
  ParseError,
  SkillError,
  SpmError,
} from './errors'

// GitHub
export {
  cloneAndDiscover,
  discoverSkillsInDir,
  listRepoSkills,
  parseGitHubUrl,
  parseOwnerRepo,
} from './github/listSkills'
export type { SkillInfo } from './github/types'
// Install
export {
  fetchSkillsFromLock,
  installSkills,
  installStageHooks,
  linkSkillsFromLock,
} from './install/installSkills'
// Specifiers
export { normalizeSpecifier } from './specifiers/normalizeSpecifier'
export { parseSpecifier } from './specifiers/parseSpecifier'

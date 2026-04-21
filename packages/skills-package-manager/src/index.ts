// Commands

// CLI
export { runCli } from './cli/runCli'
export { addCommand } from './commands/add'
export { initCommand } from './commands/init'
export { installCommand } from './commands/install'
export { patchCommand } from './commands/patch'
export { patchCommitCommand } from './commands/patchCommit'
export { updateCommand } from './commands/update'
export { isLockInSync } from './config/compareSkillsLock'
export { readSkillsLock } from './config/readSkillsLock'
export { readSkillsManifest } from './config/readSkillsManifest'
export { expandSkillsManifest, normalizeSkillsManifest } from './config/skillsManifest'
// Config
export { resolveLockEntry } from './config/syncSkillsLock'
export type {
  AddCommandOptions,
  InitCommandOptions,
  InstallCommandOptions,
  InstallProgressEvent,
  InstallProgressListener,
  NormalizedSpecifier,
  PatchCommandOptions,
  PatchCommandResult,
  PatchCommitCommandOptions,
  PatchCommitCommandResult,
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
export { createInstallProgressReporter } from './install/progressReporter'
// Install
export { installStageHooks, withBundledSelfSkillLock } from './install/withBundledSelfSkillLock'
// Specifiers
export { normalizeSpecifier } from './specifiers/normalizeSpecifier'
export { parseSpecifier } from './specifiers/parseSpecifier'

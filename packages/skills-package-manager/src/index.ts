// Commands

// CLI
export { runCli } from './cli/runCli'
export { addCommand } from './commands/add'
export { initCommand } from './commands/init'
export { installCommand } from './commands/install'
export { patchCommand } from './commands/patch'
export { patchCommitCommand } from './commands/patchCommit'
export { updateCommand } from './commands/update'
export { readSkillsManifest } from './config/readSkillsManifest'
export { resolveSkillEntry, resolveSkillsPlan } from './config/resolveSkillsPlan'
export { expandSkillsManifest, normalizeSkillsManifest } from './config/skillsManifest'
// Config
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
  ResolvedSkillsPlan,
  ResolvedSkillEntry,
  SkillsManifest,
  UpdateCommandOptions,
  UpdateCommandResult,
} from './config/types'
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
export { installSkills } from './install/installSkills'
export { installStageHooks } from './install/installPlan'
export { createInstallProgressReporter } from './install/progressReporter'
// Specifiers
export { normalizeSpecifier } from './specifiers/normalizeSpecifier'
export { parseSpecifier } from './specifiers/parseSpecifier'

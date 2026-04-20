// Commands

// CLI
export { runCli } from './cli/runCli'
export { addCommand } from './commands/add'
export { initCommand } from './commands/init'
export { installCommand } from './commands/install'
export { patchCommand } from './commands/patch'
export { patchCommitCommand } from './commands/patchCommit'
export { updateCommand } from './commands/update'
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
export { Installer } from './pipeline/Installer'
export { ConfigRepository } from './repositories/ConfigRepository'
export { LockfileRepository } from './repositories/LockfileRepository'
export { ManifestRepository } from './repositories/ManifestRepository'
export type { ResolveContext, Resolver } from './resolvers/Resolver'
export { ResolverRegistry } from './resolvers/ResolverRegistry'
export { Config } from './structures/Config'
export { LockEntry } from './structures/LockEntry'
export { Lockfile } from './structures/Lockfile'
export { Manifest } from './structures/Manifest'
export { Resolution } from './structures/Resolution'
export { Specifier } from './structures/Specifier'

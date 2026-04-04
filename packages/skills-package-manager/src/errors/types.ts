import { ErrorCode } from './codes'
import { SpmError } from './SpmError'

/**
 * Error thrown when file system operations fail
 */
export class FileSystemError extends SpmError {
  readonly operation: string
  readonly path: string

  constructor(options: {
    code:
      | ErrorCode.FILE_NOT_FOUND
      | ErrorCode.PERMISSION_DENIED
      | ErrorCode.FILE_EXISTS
      | ErrorCode.FS_ERROR
    operation: 'read' | 'write' | 'access' | 'mkdir' | 'rm' | 'copy' | 'symlink' | string
    path: string
    message?: string
    cause?: Error
  }) {
    const message = options.message ?? `${options.operation} failed for ${options.path}`
    super({
      code: options.code,
      message,
      cause: options.cause,
      context: { operation: options.operation, path: options.path },
    })
    this.operation = options.operation
    this.path = options.path
    this.name = 'FileSystemError'
  }
}

/**
 * Error thrown when git operations fail
 */
export class GitError extends SpmError {
  readonly operation: string
  readonly repoUrl?: string
  readonly ref?: string

  constructor(options: {
    code:
      | ErrorCode.GIT_CLONE_FAILED
      | ErrorCode.GIT_FETCH_FAILED
      | ErrorCode.GIT_CHECKOUT_FAILED
      | ErrorCode.GIT_REF_NOT_FOUND
      | ErrorCode.GIT_NOT_INSTALLED
    operation: 'clone' | 'fetch' | 'checkout' | 'ls-remote' | 'rev-parse' | string
    repoUrl?: string
    ref?: string
    message?: string
    cause?: Error
  }) {
    const message =
      options.message ??
      `git ${options.operation} failed${options.repoUrl ? ` for ${options.repoUrl}` : ''}`
    super({
      code: options.code,
      message,
      cause: options.cause,
      context: { operation: options.operation, repoUrl: options.repoUrl, ref: options.ref },
    })
    this.operation = options.operation
    this.repoUrl = options.repoUrl
    this.ref = options.ref
    this.name = 'GitError'
  }
}

/**
 * Error thrown when parsing fails (JSON, YAML, specifiers)
 */
export class ParseError extends SpmError {
  readonly filePath?: string
  readonly content?: string

  constructor(options: {
    code:
      | ErrorCode.PARSE_ERROR
      | ErrorCode.JSON_PARSE_ERROR
      | ErrorCode.YAML_PARSE_ERROR
      | ErrorCode.INVALID_SPECIFIER
    filePath?: string
    content?: string
    message: string
    cause?: Error
  }) {
    super({
      code: options.code,
      message: options.message,
      cause: options.cause,
      context: {
        filePath: options.filePath,
        contentSnippet: options.content?.slice(0, 200),
      },
    })
    this.filePath = options.filePath
    this.content = options.content
    this.name = 'ParseError'
  }
}

/**
 * Error thrown when manifest or lockfile operations fail
 */
export class ManifestError extends SpmError {
  readonly filePath: string

  constructor(options: {
    code:
      | ErrorCode.MANIFEST_NOT_FOUND
      | ErrorCode.LOCKFILE_NOT_FOUND
      | ErrorCode.LOCKFILE_OUTDATED
      | ErrorCode.MANIFEST_EXISTS
    filePath: string
    message?: string
    cause?: Error
  }) {
    const defaultMessages: Record<string, string> = {
      [ErrorCode.MANIFEST_NOT_FOUND]: `Manifest not found: ${options.filePath}`,
      [ErrorCode.LOCKFILE_NOT_FOUND]: `Lockfile not found: ${options.filePath}`,
      [ErrorCode.LOCKFILE_OUTDATED]: `Lockfile is out of date: ${options.filePath}`,
      [ErrorCode.MANIFEST_EXISTS]: `Manifest already exists: ${options.filePath}`,
    }
    const message =
      options.message ?? defaultMessages[options.code] ?? `Manifest error: ${options.filePath}`
    super({
      code: options.code,
      message,
      cause: options.cause,
      context: { filePath: options.filePath },
    })
    this.filePath = options.filePath
    this.name = 'ManifestError'
  }
}

/**
 * Error thrown when a skill operation fails
 */
export class SkillError extends SpmError {
  readonly skillName: string

  constructor(options: {
    code: ErrorCode.SKILL_NOT_FOUND | ErrorCode.SKILL_EXISTS | ErrorCode.VALIDATION_ERROR
    skillName: string
    message?: string
    cause?: Error
  }) {
    const defaultMessages: Record<string, string> = {
      [ErrorCode.SKILL_NOT_FOUND]: `Skill not found: ${options.skillName}`,
      [ErrorCode.SKILL_EXISTS]: `Skill already exists: ${options.skillName}`,
      [ErrorCode.VALIDATION_ERROR]: `Skill validation failed: ${options.skillName}`,
    }
    const message =
      options.message ?? defaultMessages[options.code] ?? `Skill error: ${options.skillName}`
    super({
      code: options.code,
      message,
      cause: options.cause,
      context: { skillName: options.skillName },
    })
    this.skillName = options.skillName
    this.name = 'SkillError'
  }
}

/**
 * Error thrown when network operations fail
 */
export class NetworkError extends SpmError {
  readonly url?: string

  constructor(options: {
    code: ErrorCode.NETWORK_ERROR | ErrorCode.REPO_NOT_FOUND
    url?: string
    message: string
    cause?: Error
  }) {
    super({
      code: options.code,
      message: options.message,
      cause: options.cause,
      context: { url: options.url },
    })
    this.url = options.url
    this.name = 'NetworkError'
  }
}

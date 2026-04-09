import { ErrorCode } from './codes'
import { SpmError } from './SpmError'
import {
  FileSystemError,
  GitError,
  ManifestError,
  NetworkError,
  ParseError,
  SkillError,
} from './types'

export {
  ErrorCode,
  FileSystemError,
  GitError,
  ManifestError,
  NetworkError,
  ParseError,
  SkillError,
  SpmError,
}

/**
 * Converts a Node.js file system error to an appropriate SPM error type
 */
export function convertNodeError(
  error: NodeJS.ErrnoException,
  context: { operation: string; path: string },
): FileSystemError {
  switch (error.code) {
    case 'ENOENT':
      return new FileSystemError({
        code: ErrorCode.FILE_NOT_FOUND,
        operation: context.operation,
        path: context.path,
        cause: error,
      })
    case 'EACCES':
    case 'EPERM':
      return new FileSystemError({
        code: ErrorCode.PERMISSION_DENIED,
        operation: context.operation,
        path: context.path,
        cause: error,
      })
    case 'EEXIST':
      return new FileSystemError({
        code: ErrorCode.FILE_EXISTS,
        operation: context.operation,
        path: context.path,
        cause: error,
      })
    case 'ENOTDIR':
      return new FileSystemError({
        code: ErrorCode.FS_ERROR,
        operation: context.operation,
        path: context.path,
        message: `Not a directory: ${context.path}`,
        cause: error,
      })
    case 'EISDIR':
      return new FileSystemError({
        code: ErrorCode.FS_ERROR,
        operation: context.operation,
        path: context.path,
        message: `Is a directory: ${context.path}`,
        cause: error,
      })
    default:
      return new FileSystemError({
        code: ErrorCode.FS_ERROR,
        operation: context.operation,
        path: context.path,
        message: error.message,
        cause: error,
      })
  }
}

/**
 * Formats an error for display to the user
 * Provides helpful context for known error types
 */
export function formatErrorForDisplay(error: unknown): string {
  if (error instanceof SpmError) {
    let output = `Error [${error.code}]: ${error.message}`

    // Add context-specific hints
    if (error instanceof FileSystemError) {
      if (error.code === ErrorCode.FILE_NOT_FOUND) {
        output += `\n\nThe file "${error.path}" was not found.`
        if (error.path.endsWith('skills.json')) {
          output += `\nRun "spm init" to create a new skills.json file.`
        }
      } else if (error.code === ErrorCode.PERMISSION_DENIED) {
        output += `\n\nPermission denied for "${error.path}".`
        output += `\nCheck that you have read/write access to this location.`
      }
    } else if (error instanceof GitError) {
      if (error.code === ErrorCode.GIT_REF_NOT_FOUND) {
        output += `\n\nThe reference "${error.ref}" could not be found in the repository.`
        output += `\nPlease check that the branch, tag, or commit hash is correct.`
      } else if (error.code === ErrorCode.GIT_CLONE_FAILED) {
        output += `\n\nFailed to clone the repository.`
        output += `\nPossible causes:`
        output += `\n  - The repository URL is incorrect`
        output += `\n  - The repository is private and requires authentication`
        output += `\n  - There is no internet connection`
      }
    } else if (error instanceof ParseError) {
      if (error.code === ErrorCode.JSON_PARSE_ERROR || error.code === ErrorCode.YAML_PARSE_ERROR) {
        output += `\n\nFile: ${error.filePath}`
        output += `\nPlease check the file syntax and fix any formatting issues.`
      } else if (error.code === ErrorCode.INVALID_SPECIFIER) {
        output += `\n\nInvalid skill specifier format.`
        output += `\nExpected formats:`
        output += `\n  - owner/repo (GitHub shorthand)`
        output += `\n  - https://github.com/owner/repo.git`
        output += `\n  - link:./path/to/skill-dir`
        output += `\n  - file:./path/to/skill-package.tgz#path:/skills/my-skill`
        output += `\n  - npm:@scope/skill-package#path:/skills/my-skill`
      }
    } else if (error instanceof ManifestError) {
      if (error.code === ErrorCode.LOCKFILE_OUTDATED) {
        output += `\n\nThe lockfile is out of sync with skills.json.`
        output += `\nRun "spm install" to update the lockfile.`
      } else if (error.code === ErrorCode.MANIFEST_VALIDATION_ERROR) {
        output += `\n\nPlease fix the validation errors in "${error.filePath}".`
        output += `\nRefer to the JSON Schema at: https://unpkg.com/skills-package-manager@latest/skills.schema.json`
      }
    }

    if (error.cause && !(error instanceof GitError || error instanceof FileSystemError)) {
      output += `\n\nCaused by: ${error.cause.message}`
    }

    return output
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`
  }

  return `Error: ${String(error)}`
}

/**
 * Checks if an error is a known SPM error
 */
export function isSpmError(error: unknown): error is SpmError {
  return error instanceof SpmError
}

/**
 * Gets the exit code for an error
 * Returns 1 for general errors, specific codes for known error types
 */
export function getExitCode(error: unknown): number {
  if (error instanceof SpmError) {
    // Map error codes to exit codes
    if (error.code.startsWith('E1')) return 101 // File system errors
    if (error.code.startsWith('E2')) return 102 // Git errors
    if (error.code.startsWith('E3')) return 103 // Parse errors
    if (error.code.startsWith('E4')) return 104 // Manifest errors
    if (error.code.startsWith('E5')) return 105 // Network errors
    if (error.code.startsWith('E9')) return 109 // General errors
  }
  return 1
}

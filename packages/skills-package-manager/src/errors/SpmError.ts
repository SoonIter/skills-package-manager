import type { ErrorCode } from './codes'

/**
 * Base error class for SPM (Skills Package Manager)
 * All custom errors should extend this class
 */
export class SpmError extends Error {
  readonly code: ErrorCode
  readonly cause?: Error
  readonly context: Record<string, unknown>

  constructor(options: {
    code: ErrorCode
    message: string
    cause?: Error
    context?: Record<string, unknown>
  }) {
    super(options.message)
    this.code = options.code
    this.cause = options.cause
    this.context = options.context ?? {}
    this.name = 'SpmError'

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SpmError)
    }
  }

  /**
   * Returns a formatted string representation of the error
   */
  toString(): string {
    let result = `${this.code}: ${this.message}`
    if (this.cause) {
      result += `\n  Caused by: ${this.cause.message}`
    }
    return result
  }

  /**
   * Returns a detailed object representation for logging/debugging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause
        ? {
            name: this.cause.name,
            message: this.cause.message,
          }
        : undefined,
      stack: this.stack,
    }
  }
}

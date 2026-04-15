// pnpm v11
import { afterAllResolved, preResolution } from './dist/index.mjs'

export const hooks = {
  afterAllResolved: (lockfile, context) => {
    return afterAllResolved(lockfile, context)
  },
  preResolution: (options) => {
    return preResolution(options)
  },
}

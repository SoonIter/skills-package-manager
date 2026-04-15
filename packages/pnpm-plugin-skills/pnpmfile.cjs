// pnpm v10
const { afterAllResolved, preResolution } = require('./dist/index.js')

module.exports = {
  hooks: {
    afterAllResolved: (lockfile, context) => {
      return afterAllResolved(lockfile, context)
    },
    preResolution: (options) => {
      return preResolution(options)
    },
  },
}

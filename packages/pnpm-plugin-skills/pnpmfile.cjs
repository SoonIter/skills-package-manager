// pnpm v10
const { afterAllResolved, preResolution } = require('./dist/index.js')

module.exports = {
  hooks: {
    afterAllResolved: (lockfile, context) => {
      return afterAllResolved(lockfile, context)
    },
    preResolution: (manifest, context) => {
      return preResolution(manifest, context)
    },
  },
}

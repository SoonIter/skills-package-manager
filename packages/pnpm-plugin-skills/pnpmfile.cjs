// pnpm v10
const { afterAllResolved, preResolution } = require('./dist/index.js')

module.exports = {
  hooks: {
    afterAllResolved,
    preResolution,
  },
}

const { preResolution } = require('./dist/runtime.cjs')

module.exports = {
  hooks: {
    preResolution,
  },
}

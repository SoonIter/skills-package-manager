// pnpm v10
const { preResolution } = require('./dist/index.js')

module.exports = {
  hooks: {
    preResolution,
  },
}

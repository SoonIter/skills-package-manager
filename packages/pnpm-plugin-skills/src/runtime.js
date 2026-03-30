const { pathToFileURL } = require('node:url')
const path = require('node:path')

async function loadInstallSkills(workspaceRoot) {
  const modulePath = path.join(workspaceRoot, 'packages/skills-pm/dist/index.js')
  const mod = await import(pathToFileURL(modulePath).href)
  return mod.installCommand
}

async function preResolution(options = {}) {
  const lockfileDir = options.lockfileDir
  if (!lockfileDir) {
    return undefined
  }

  const workspaceRoot = options.workspaceRoot || lockfileDir
  const installCommand = await loadInstallSkills(workspaceRoot)
  await installCommand({ cwd: lockfileDir })
  return undefined
}

module.exports = {
  preResolution,
}

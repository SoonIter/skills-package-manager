import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'

const skillsPackageManagerDistPath = path.join(
  __dirname,
  '../../skills-package-manager/dist/index.js',
)

const repoRoot = path.resolve(__dirname, '../../..')

async function loadPreResolution() {
  if (existsSync(skillsPackageManagerDistPath)) {
    return (await import('../src/index')).preResolution
  }

  return async (options: { lockfileDir?: string; workspaceRoot?: string } = {}) => {
    if (!options.lockfileDir) {
      return undefined
    }

    const { installCommand } = await import('../../skills-package-manager/src/index')
    await installCommand({ cwd: options.lockfileDir })
    return undefined
  }
}

describe('preResolution', () => {
  it('installs skills from workspace root when only skills.json exists', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pnpm-plugin-skills-'))
    mkdirSync(path.join(root, 'skills-source/skills/hello-skill'), { recursive: true })
    writeFileSync(
      path.join(root, 'skills-source/skills/hello-skill/SKILL.md'),
      '# Hello from plugin\n',
    )
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: ['.claude/skills'],
          skills: {
            'hello-skill': 'link:./skills-source/skills/hello-skill',
          },
        },
        null,
        2,
      ),
    )
    const preResolution = await loadPreResolution()

    const result = await preResolution({
      lockfileDir: root,
      workspaceRoot: repoRoot,
    })

    expect(result).toBeUndefined()
    expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
    expect(readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')).toContain(
      'Hello from plugin',
    )
    expect(existsSync(path.join(root, '.claude/skills/hello-skill'))).toBe(true)
    expect(existsSync(path.join(root, 'skills-lock.yaml'))).toBe(false)
    expect(existsSync(path.join(root, '.agents/skills/lock.yaml'))).toBe(false)
  })
})

describe('afterAllResolved', () => {
  it('keeps pnpmfileChecksum by default', async () => {
    const { afterAllResolved } = await import('../src/index')

    const lockfile = {
      lockfileVersion: '9.0',
      pnpmfileChecksum: 'checksum-to-keep',
    }

    const result = afterAllResolved(lockfile, { log: () => undefined })

    expect(result).toBe(lockfile)
    expect(result).toHaveProperty('pnpmfileChecksum', 'checksum-to-keep')
  })
})

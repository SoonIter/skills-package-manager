import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'

const skillsPackageManagerDistPath = path.join(
  __dirname,
  '../../skills-package-manager/dist/index.js',
)

const repoRoot = path.resolve(__dirname, '../../..')
describe('preResolution', () => {
  it('installs skills from workspace root when manifest and lock exist', async () => {
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
    writeFileSync(
      path.join(root, 'skills-lock.yaml'),
      [
        "lockfileVersion: '0.1'",
        'installDir: .agents/skills',
        'linkTargets:',
        '  - .claude/skills',
        'skills:',
        '  hello-skill:',
        '    specifier: link:./skills-source/skills/hello-skill',
        '    resolution:',
        '      type: link',
        `      path: ${JSON.stringify(path.join(root, 'skills-source/skills/hello-skill'))}`,
        '    digest: test-digest',
      ].join('\n'),
    )

    const { preResolution } = existsSync(skillsPackageManagerDistPath)
      ? await import('../src/index')
      : await import('../../skills-package-manager/src/index')

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
  })
})

describe('afterAllResolved', () => {
  it('removes pnpmfileChecksum when enabled in skills.json', async () => {
    const { afterAllResolved } = await import('../src/index')
    const root = mkdtempSync(path.join(tmpdir(), 'pnpm-plugin-skills-config-'))

    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          pnpmPlugin: {
            removePnpmfileChecksum: true,
          },
          skills: {},
        },
        null,
        2,
      ),
    )

    const lockfile = {
      lockfileVersion: '9.0',
      pnpmfileChecksum: 'checksum-to-remove',
    }

    const result = afterAllResolved(lockfile, { lockfileDir: root })

    expect(result).toBe(lockfile)
    expect(result).not.toHaveProperty('pnpmfileChecksum')
  })

  it('keeps pnpmfileChecksum by default', async () => {
    const { afterAllResolved } = await import('../src/index')

    const lockfile = {
      lockfileVersion: '9.0',
      pnpmfileChecksum: 'checksum-to-keep',
    }

    const result = afterAllResolved(lockfile, {})

    expect(result).toBe(lockfile)
    expect(result).toHaveProperty('pnpmfileChecksum', 'checksum-to-keep')
  })
})

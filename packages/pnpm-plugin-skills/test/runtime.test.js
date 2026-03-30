import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import runtimeModule from '../src/runtime'

const { preResolution } = runtimeModule
const repoRoot = path.resolve(__dirname, '../../..')
describe('preResolution', () => {
  it('installs skills from workspace root when manifest and lock exist', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'pnpm-plugin-skills-'))
    mkdirSync(path.join(root, 'skills-source/skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(root, 'skills-source/skills/hello-skill/SKILL.md'), '# Hello from plugin\n')
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: ['.cursor/skills'],
          skills: {
            'hello-skill': 'file:./skills-source#path:/skills/hello-skill',
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
        '  - .cursor/skills',
        'skills:',
        '  hello-skill:',
        '    specifier: file:./skills-source#path:/skills/hello-skill',
        '    resolution:',
        '      type: file',
        `      path: ${JSON.stringify(path.join(root, 'skills-source'))}`,
        '    digest: test-digest',
      ].join('\n'),
    )

    const result = await preResolution({
      lockfileDir: root,
      workspaceRoot: repoRoot,
    })

    expect(result).toBeUndefined()
    expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
    expect(readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')).toContain('Hello from plugin')
    expect(existsSync(path.join(root, '.cursor/skills/hello-skill'))).toBe(true)
  })
})

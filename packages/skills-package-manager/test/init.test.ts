import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { cancel } from '@clack/prompts'
import { describe, expect, it } from '@rstest/core'
import { promptInitManifestOptions } from '../src/cli/prompt'
import { runCli } from '../src/cli/runCli'
import { initCommand } from '../src/commands/init'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'))
const DEFAULT_SCHEMA_URL = `https://unpkg.com/skills-package-manager@${pkg.version}/skills.schema.json`

describe('initCommand', () => {
  it('writes default manifest when yes is true', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-init-yes-'))

    const result = await initCommand({ cwd: root, yes: true })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(result).toEqual({
      $schema: DEFAULT_SCHEMA_URL,
      installDir: '.agents/skills',
      linkTargets: [],
      selfSkill: false,
      skills: {},
    })
    expect(manifest).toEqual({
      $schema: DEFAULT_SCHEMA_URL,
      installDir: '.agents/skills',
      linkTargets: [],
      selfSkill: false,
      skills: {},
    })
    expect(existsSync(path.join(root, 'skills-lock.yaml'))).toBe(false)
  })

  it('fails when skills.json already exists', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-init-exists-'))
    writeFileSync(path.join(root, 'skills.json'), JSON.stringify({ skills: {} }, null, 2))

    await expect(initCommand({ cwd: root, yes: true })).rejects.toThrow(
      'skills.json already exists',
    )
  })

  it('uses interactive answers when yes is false', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-init-interactive-'))

    const result = await initCommand({ cwd: root }, async () => ({
      installDir: '.custom/skills',
      linkTargets: ['.claude/skills', '.continue/skills'],
    }))

    expect(result).toEqual({
      $schema: DEFAULT_SCHEMA_URL,
      installDir: '.custom/skills',
      linkTargets: ['.claude/skills', '.continue/skills'],
      selfSkill: false,
      skills: {},
    })
  })

  it('does not write files when interactive flow is cancelled', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-init-cancel-'))

    await expect(
      initCommand({ cwd: root }, async () => {
        throw new Error('prompt cancelled')
      }),
    ).rejects.toThrow('prompt cancelled')

    expect(existsSync(path.join(root, 'skills.json'))).toBe(false)
  })
})

describe('promptInitManifestOptions', () => {
  it('prompts additional link targets directly without confirm step', async () => {
    const calls: string[] = []

    const result = await promptInitManifestOptions(
      {
        text: async () => '.agents/skills',
        groupMultiselect: async <Value>() => {
          calls.push('groupMultiselect')
          return ['.claude/skills'] as Value[]
        },
        note: () => {
          calls.push('note')
        },
        cancel: () => {},
        isCancel: (value: unknown): value is symbol => value === cancel,
      },
      () => {
        throw new Error('should not exit')
      },
    )

    expect(result).toEqual({
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
    })
    expect(calls).toEqual(['note', 'groupMultiselect'])
  })
})

describe('documentation', () => {
  it('documents top-level CLI usage and commands in package README', () => {
    const readme = readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8')

    expect(readme).toContain('npx skills-package-manager --help')
    expect(readme).toContain('npx skills-package-manager --version')
    expect(readme).toContain('npx skills-package-manager add <specifier> [--skill <name>]')
    expect(readme).toContain('npx skills-package-manager install')
    expect(readme).toContain('npx skills-package-manager update [skill...]')
    expect(readme).toContain('npx skills-package-manager init [--yes]')
    expect(readme).toContain('### `npx skills-package-manager add`')
    expect(readme).toContain('### `npx skills-package-manager install`')
    expect(readme).toContain('### `npx skills-package-manager update`')
    expect(readme).toContain('### `npx skills-package-manager init`')
  })
})

describe('CLI', () => {
  it('dispatches init --yes from CLI', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-init-cli-yes-'))

    const result = await runCli(['node', 'spm', 'init', '--yes'], { cwd: root })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(result).toEqual({
      $schema: DEFAULT_SCHEMA_URL,
      installDir: '.agents/skills',
      linkTargets: [],
      selfSkill: false,
      skills: {},
    })
    expect(manifest).toEqual({
      $schema: DEFAULT_SCHEMA_URL,
      installDir: '.agents/skills',
      linkTargets: [],
      selfSkill: false,
      skills: {},
    })
  })

  it('rejects positional args for init', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-init-cli-positionals-'))

    await expect(runCli(['node', 'spm', 'init', 'extra'], { cwd: root })).rejects.toThrow(
      'init does not accept positional arguments',
    )
  })

  it('rejects unknown flags for init', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-init-cli-unknown-'))

    await expect(runCli(['node', 'spm', 'init', '--force'], { cwd: root })).rejects.toThrow(
      'Unknown flag for init: --force',
    )
  })

  it('rejects init --yes when provided a value', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-init-cli-yes-value-'))

    await expect(runCli(['node', 'spm', 'init', '--yes', 'true'], { cwd: root })).rejects.toThrow(
      'init --yes does not accept a value',
    )
  })
})

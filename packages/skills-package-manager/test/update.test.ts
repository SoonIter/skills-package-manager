import { describe, expect, it } from '@rstest/core'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import YAML from 'yaml'
import { resolveLockEntry } from '../src/config/syncSkillsLock'
import { fetchSkillsFromLock, installStageHooks, linkSkillsFromLock } from '../src/install/installSkills'
import { updateCommand } from '../src/commands/update'
import type { SkillsLock, SkillsManifest } from '../src/config/types'

describe('resolveLockEntry', () => {
  it('resolves git specifiers to the current commit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-source-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Hello skill\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const commit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

    const { skillName, entry } = await resolveLockEntry(root, `${gitRepo}#HEAD&path:/skills/hello-skill`)

    expect(skillName).toBe('hello-skill')
    expect(entry.resolution.type).toBe('git')
    if (entry.resolution.type !== 'git') {
      throw new Error('Expected git resolution')
    }
    expect(entry.resolution.commit).toBe(commit)
    expect(entry.resolution.path).toBe('/skills/hello-skill')
  })
})

describe('install stages', () => {
  it('materializes and links skills from a provided lockfile', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-fetch-link-'))
    const sourceRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-local-source-'))
    mkdirSync(path.join(sourceRoot, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(sourceRoot, 'skills/hello-skill/SKILL.md'), '# Hello stage\n')

    const manifest: SkillsManifest = {
      installDir: '.agents/skills',
      linkTargets: ['.cursor/skills'],
      skills: {
        'hello-skill': `file:${sourceRoot}#path:/skills/hello-skill`,
      },
    }

    const lockfile: SkillsLock = {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: ['.cursor/skills'],
      skills: {
        'hello-skill': {
          specifier: `file:${sourceRoot}#path:/skills/hello-skill`,
          resolution: { type: 'file', path: sourceRoot },
          digest: 'sha256-test',
        },
      },
    }

    await fetchSkillsFromLock(root, manifest, lockfile)
    await linkSkillsFromLock(root, manifest, lockfile)

    const installed = readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')
    expect(installed).toContain('Hello stage')
    expect(existsSync(path.join(root, '.cursor/skills/hello-skill'))).toBe(true)
  })
})

describe('updateCommand validation', () => {
  it('fails when a named skill is not present in skills.json', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-missing-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify({ skills: { alpha: 'file:./alpha#path:/alpha' } }, null, 2),
    )

    await expect(updateCommand({ cwd: root, skills: ['missing'] })).rejects.toThrow('Unknown skill: missing')
  })
})

describe('updateCommand resolve', () => {
  it('updates git targets and skips file targets', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-targets-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-git-'))
    const fileRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-file-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Version 1\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const oldCommit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Version 2\n')
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m update', { cwd: gitRepo, stdio: 'ignore' })
    const newCommit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

    mkdirSync(path.join(fileRepo, 'local-skill'), { recursive: true })
    writeFileSync(path.join(fileRepo, 'local-skill/SKILL.md'), '# Local\n')

    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'hello-skill': `${gitRepo}#HEAD&path:/skills/hello-skill`,
            'local-skill': `file:${fileRepo}#path:/local-skill`,
          },
        },
        null,
        2,
      ),
    )

    writeFileSync(
      path.join(root, 'skills-lock.yaml'),
      YAML.stringify({
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `${gitRepo}#HEAD&path:/skills/hello-skill`,
            resolution: { type: 'git', url: gitRepo, commit: oldCommit, path: '/skills/hello-skill' },
            digest: `sha256-${oldCommit}`,
          },
          'local-skill': {
            specifier: `file:${fileRepo}#path:/local-skill`,
            resolution: { type: 'file', path: fileRepo },
            digest: 'sha256-local',
          },
        },
      }),
    )

    const result = await updateCommand({ cwd: root })

    expect(result.updated).toEqual(['hello-skill'])
    expect(result.skipped).toEqual([{ name: 'local-skill', reason: 'file-specifier' }])
    expect(result.failed).toEqual([])
    expect(result.unchanged).toEqual([])
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
    expect(lockfile.skills['hello-skill'].resolution.commit).toBe(newCommit)
  })

  it('does not write the new lockfile when fetch fails', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-atomic-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-atomic-source-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Atomic v1\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const oldCommit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Atomic v2\n')
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m update', { cwd: gitRepo, stdio: 'ignore' })

    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'hello-skill': `${gitRepo}#HEAD&path:/skills/hello-skill`,
          },
        },
        null,
        2,
      ),
    )

    writeFileSync(
      path.join(root, 'skills-lock.yaml'),
      YAML.stringify({
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `${gitRepo}#HEAD&path:/skills/hello-skill`,
            resolution: { type: 'git', url: gitRepo, commit: oldCommit, path: '/skills/hello-skill' },
            digest: `sha256-${oldCommit}`,
          },
        },
      }),
    )

    installStageHooks.beforeFetch = async () => {
      throw new Error('Simulated fetch failure')
    }

    try {
      await expect(updateCommand({ cwd: root })).rejects.toThrow('Simulated fetch failure')

      const persisted = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
      expect(persisted.skills['hello-skill'].resolution.commit).toBe(oldCommit)
    } finally {
      installStageHooks.beforeFetch = async () => {}
    }
  })

  it('marks a target as unchanged when the resolved commit matches the current lock', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-unchanged-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-unchanged-source-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Stable\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const commit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'hello-skill': `${gitRepo}#HEAD&path:/skills/hello-skill`,
          },
        },
        null,
        2,
      ),
    )

    writeFileSync(
      path.join(root, 'skills-lock.yaml'),
      YAML.stringify({
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `${gitRepo}#HEAD&path:/skills/hello-skill`,
            resolution: { type: 'git', url: gitRepo, commit, path: '/skills/hello-skill' },
            digest: `sha256-${commit}`,
          },
        },
      }),
    )

    const result = await updateCommand({ cwd: root })
    expect(result.unchanged).toEqual(['hello-skill'])
    expect(result.updated).toEqual([])
    expect(result.status).toBe('skipped')
  })

  it('returns failed when any target cannot resolve and keeps the old lockfile', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-resolve-fail-'))

    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            broken: '/definitely/missing/repo.git#main&path:/skills/broken',
          },
        },
        null,
        2,
      ),
    )

    writeFileSync(
      path.join(root, 'skills-lock.yaml'),
      YAML.stringify({
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {},
      }),
    )

    const result = await updateCommand({ cwd: root })
    expect(result.status).toBe('failed')
    expect(result.failed).toHaveLength(1)
    const persisted = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
    expect(persisted.skills).toEqual({})
  })
})

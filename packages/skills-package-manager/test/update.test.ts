import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import YAML from 'yaml'
import { updateCommand } from '../src/commands/update'
import { resolveLockEntry } from '../src/config/syncSkillsLock'
import type { SkillsLock, SkillsManifest } from '../src/config/types'
import {
  fetchSkillsFromLock,
  installStageHooks,
  linkSkillsFromLock,
} from '../src/install/installSkills'
import { createSkillPackage, packDirectory, startMockNpmRegistry } from './helpers'

describe('resolveLockEntry', () => {
  it('recomputes link digests from skill directory contents', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-link-'))
    const skillDir = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-link-source-'))

    writeFileSync(path.join(skillDir, 'SKILL.md'), '# Hello skill\n')
    const first = await resolveLockEntry(root, `link:${skillDir}`)

    writeFileSync(path.join(skillDir, 'SKILL.md'), '# Updated skill\n')
    const second = await resolveLockEntry(root, `link:${skillDir}`)

    expect(first.entry.resolution.type).toBe('link')
    expect(second.entry.resolution.type).toBe('link')
    expect(first.entry.digest).not.toBe(second.entry.digest)
  })

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

    const { skillName, entry } = await resolveLockEntry(
      root,
      `${gitRepo}#HEAD&path:/skills/hello-skill`,
    )

    expect(skillName).toBe('hello-skill')
    expect(entry.resolution.type).toBe('git')
    if (entry.resolution.type !== 'git') {
      throw new Error('Expected git resolution')
    }
    expect(entry.resolution.commit).toBe(commit)
    expect(entry.resolution.path).toBe('/skills/hello-skill')
  })

  it('resolves a full commit sha to the matching commit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-sha-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-sha-source-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Hello skill\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const commit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

    const { entry } = await resolveLockEntry(root, `${gitRepo}#${commit}&path:/skills/hello-skill`)

    expect(entry.resolution.type).toBe('git')
    if (entry.resolution.type !== 'git') {
      throw new Error('Expected git resolution')
    }
    expect(entry.resolution.commit).toBe(commit)
  })

  it('resolves a short commit sha to the matching commit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-short-sha-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-short-sha-source-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Hello skill\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const commit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()
    const shortCommit = commit.slice(0, 7)

    const { entry } = await resolveLockEntry(
      root,
      `${gitRepo}#${shortCommit}&path:/skills/hello-skill`,
    )

    expect(entry.resolution.type).toBe('git')
    if (entry.resolution.type !== 'git') {
      throw new Error('Expected git resolution')
    }
    expect(entry.resolution.commit).toBe(commit)
  })

  it('resolves an annotated tag to the tagged commit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-tag-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-tag-source-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Hello skill\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const commit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()
    execSync('git tag -a v1.0.0 -m v1.0.0', { cwd: gitRepo, stdio: 'ignore' })

    const { entry } = await resolveLockEntry(root, `${gitRepo}#v1.0.0&path:/skills/hello-skill`)

    expect(entry.resolution.type).toBe('git')
    if (entry.resolution.type !== 'git') {
      throw new Error('Expected git resolution')
    }
    expect(entry.resolution.commit).toBe(commit)
  })

  it('resolves npm registry from scoped .npmrc entries', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-npm-registry-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello registry\n')
    const registry = await startMockNpmRegistry(packageRoot, { authToken: 'test-token' })

    try {
      writeFileSync(
        path.join(root, '.npmrc'),
        `registry=http://127.0.0.1:9/\n@tests:registry=${registry.registryUrl}\n${registry.authTokenConfigLine}\n`,
      )

      const { entry } = await resolveLockEntry(
        root,
        'npm:@tests/hello-skill#path:/skills/hello-skill',
      )

      expect(entry.resolution.type).toBe('npm')
      if (entry.resolution.type !== 'npm') {
        throw new Error('Expected npm resolution')
      }
      expect(entry.resolution.registry).toBe(registry.registryUrl)
      expect(entry.resolution.tarball).toBe(registry.tarballUrl)
    } finally {
      await registry.close()
    }
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
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `link:${path.join(sourceRoot, 'skills/hello-skill')}`,
      },
    }

    const lockfile: SkillsLock = {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': {
          specifier: `link:${path.join(sourceRoot, 'skills/hello-skill')}`,
          resolution: { type: 'link', path: path.join(sourceRoot, 'skills/hello-skill') },
          digest: 'sha256-test',
        },
      },
    }

    await fetchSkillsFromLock(root, manifest, lockfile)
    await linkSkillsFromLock(root, manifest, lockfile)

    const installed = readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')
    expect(installed).toContain('Hello stage')
    expect(existsSync(path.join(root, '.claude/skills/hello-skill'))).toBe(true)
  })
})

describe('updateCommand validation', () => {
  it('fails when a named skill is not present in skills.json', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-missing-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify({ skills: { alpha: 'link:./alpha' } }, null, 2),
    )

    await expect(updateCommand({ cwd: root, skills: ['missing'] })).rejects.toThrow(
      'Unknown skill: missing',
    )
  })
})

describe('updateCommand resolve', () => {
  it('updates git targets and skips link targets', async () => {
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
            'local-skill': `link:${fileRepo}/local-skill`,
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
            resolution: {
              type: 'git',
              url: gitRepo,
              commit: oldCommit,
              path: '/skills/hello-skill',
            },
            digest: `sha256-${oldCommit}`,
          },
          'local-skill': {
            specifier: `link:${fileRepo}/local-skill`,
            resolution: { type: 'link', path: `${fileRepo}/local-skill` },
            digest: 'sha256-local',
          },
        },
      }),
    )

    const result = await updateCommand({ cwd: root })

    expect(result.updated).toEqual(['hello-skill'])
    expect(result.skipped).toEqual([{ name: 'local-skill', reason: 'link-specifier' }])
    expect(result.failed).toEqual([])
    expect(result.unchanged).toEqual([])
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
    expect(lockfile.skills['hello-skill'].resolution.commit).toBe(newCommit)
  })

  it('updates git targets when the path changes even if the commit is the same', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-git-path-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-git-path-source-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    mkdirSync(path.join(gitRepo, 'skills/alt-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Version 1\n')
    writeFileSync(path.join(gitRepo, 'skills/alt-skill/SKILL.md'), '# Version 2\n')
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
            'hello-skill': `${gitRepo}#HEAD&path:/skills/alt-skill`,
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
            digest: 'sha256-old',
          },
        },
      }),
    )

    const result = await updateCommand({ cwd: root })

    expect(result.updated).toEqual(['hello-skill'])
    expect(result.unchanged).toEqual([])
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
    expect(lockfile.skills['hello-skill'].resolution.path).toBe('/skills/alt-skill')
  })

  it('updates npm targets when the resolved package version changes', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-npm-'))
    const packageRoot = createSkillPackage('hello-skill', '# Version 1\n')
    const registry = await startMockNpmRegistry(packageRoot)

    try {
      writeFileSync(path.join(root, '.npmrc'), `registry=${registry.registryUrl}\n`)
      writeFileSync(
        path.join(root, 'skills.json'),
        JSON.stringify(
          {
            installDir: '.agents/skills',
            linkTargets: [],
            skills: {
              'hello-skill': `npm:${registry.packageName}#path:/skills/hello-skill`,
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
              specifier: `npm:${registry.packageName}#path:/skills/hello-skill`,
              resolution: {
                type: 'npm',
                packageName: registry.packageName,
                version: '0.9.0',
                path: '/skills/hello-skill',
                tarball: `${registry.registryUrl}tarballs/old.tgz`,
                integrity: 'sha512-old',
                registry: registry.registryUrl,
              },
              digest: 'sha256-old',
            },
          },
        }),
      )

      const result = await updateCommand({ cwd: root })

      expect(result.updated).toEqual(['hello-skill'])
      expect(result.failed).toEqual([])
      const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
      expect(lockfile.skills['hello-skill'].resolution.version).toBe('1.0.0')
      expect(lockfile.skills['hello-skill'].resolution.tarball).toBe(registry.tarballUrl)
    } finally {
      await registry.close()
    }
  })

  it('updates npm targets when integrity changes at the same version', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-npm-integrity-'))
    const packageRoot = createSkillPackage('hello-skill', '# Version 1\n')
    const registry = await startMockNpmRegistry(packageRoot)

    try {
      writeFileSync(path.join(root, '.npmrc'), `registry=${registry.registryUrl}\n`)
      writeFileSync(
        path.join(root, 'skills.json'),
        JSON.stringify(
          {
            installDir: '.agents/skills',
            linkTargets: [],
            skills: {
              'hello-skill': `npm:${registry.packageName}#path:/skills/hello-skill`,
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
              specifier: `npm:${registry.packageName}#path:/skills/hello-skill`,
              resolution: {
                type: 'npm',
                packageName: registry.packageName,
                version: registry.version,
                path: '/skills/hello-skill',
                tarball: registry.tarballUrl,
                integrity: 'sha512-old',
                registry: registry.registryUrl,
              },
              digest: 'sha256-old',
            },
          },
        }),
      )

      const result = await updateCommand({ cwd: root })

      expect(result.updated).toEqual(['hello-skill'])
      expect(result.unchanged).toEqual([])
    } finally {
      await registry.close()
    }
  })

  it('updates npm targets when the resolved registry changes at the same version', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-npm-registry-change-'))
    const packageRoot = createSkillPackage('hello-skill', '# Version 1\n')
    const registry = await startMockNpmRegistry(packageRoot)

    try {
      writeFileSync(path.join(root, '.npmrc'), `registry=${registry.registryUrl}\n`)
      writeFileSync(
        path.join(root, 'skills.json'),
        JSON.stringify(
          {
            installDir: '.agents/skills',
            linkTargets: [],
            skills: {
              'hello-skill': `npm:${registry.packageName}#path:/skills/hello-skill`,
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
              specifier: `npm:${registry.packageName}#path:/skills/hello-skill`,
              resolution: {
                type: 'npm',
                packageName: registry.packageName,
                version: registry.version,
                path: '/skills/hello-skill',
                tarball: registry.tarballUrl,
                integrity: registry.integrity,
                registry: `${registry.registryUrl}mirror/`,
              },
              digest: 'sha256-old',
            },
          },
        }),
      )

      const result = await updateCommand({ cwd: root })

      expect(result.updated).toEqual(['hello-skill'])
      expect(result.unchanged).toEqual([])
      const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
      expect(lockfile.skills['hello-skill'].resolution.registry).toBe(registry.registryUrl)
    } finally {
      await registry.close()
    }
  })

  it('marks file tarball targets unchanged when the tarball digest matches', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-file-unchanged-'))
    const packageRoot = createSkillPackage('hello-skill', '# Packed skill\n')
    const tarballPath = packDirectory(packageRoot)
    const { entry } = await resolveLockEntry(root, `file:${tarballPath}#path:/skills/hello-skill`)

    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
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
          'hello-skill': entry,
        },
      }),
    )

    const result = await updateCommand({ cwd: root })

    expect(result.unchanged).toEqual(['hello-skill'])
    expect(result.updated).toEqual([])
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
            resolution: {
              type: 'git',
              url: gitRepo,
              commit: oldCommit,
              path: '/skills/hello-skill',
            },
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

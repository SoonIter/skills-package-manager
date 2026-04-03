import { describe, expect, it } from '@rstest/core'
import { mkdtempSync, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { fetchSkillsFromLock, installSkills } from '../src/install/installSkills'
import type { SkillsLock, SkillsManifest } from '../src/config/types'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { writeSkillsLock } from '../src/config/writeSkillsLock'

describe('installSkills', () => {
  it('installs a local skill and creates symlinks', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-'))
    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
      },
    })
    await writeSkillsLock(root, {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': {
          specifier: `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
          resolution: {
            type: 'file',
            path: path.resolve(__dirname, 'fixtures/local-source'),
          },
          digest: 'test-digest',
        },
      },
    })

    await installSkills(root)

    const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
    const linkedSkill = path.join(root, '.claude/skills/hello-skill')
    expect(existsSync(installedSkill)).toBe(true)
    expect(lstatSync(linkedSkill).isSymbolicLink()).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello skill')
  })

  it('installs a git skill from a local git repository', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-git-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-git-source-'))

    require('node:fs').mkdirSync(path.join(gitRepo, 'skills/hello-git-skill'), { recursive: true })
    require('node:fs').writeFileSync(path.join(gitRepo, 'skills/hello-git-skill/SKILL.md'), '# Hello from git\n')
    require('node:child_process').execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-git-skill': `${gitRepo}#HEAD&path:/skills/hello-git-skill`,
      },
    })
    await writeSkillsLock(root, {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-git-skill': {
          specifier: `${gitRepo}#HEAD&path:/skills/hello-git-skill`,
          resolution: {
            type: 'git',
            url: gitRepo,
            commit: 'HEAD',
            path: '/skills/hello-git-skill',
          },
          digest: 'test-git-digest',
        },
      },
    })

    await installSkills(root)

    const installedSkill = path.join(root, '.agents/skills/hello-git-skill/SKILL.md')
    expect(existsSync(installedSkill)).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello from git')
  })

  it('installs a git skill pinned to a non-head commit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-git-pinned-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-git-pinned-source-'))
    const remoteRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-git-pinned-remote-'))

    require('node:fs').mkdirSync(path.join(gitRepo, 'skills/hello-git-skill'), { recursive: true })
    require('node:fs').writeFileSync(path.join(gitRepo, 'skills/hello-git-skill/SKILL.md'), '# First version\n')
    require('node:child_process').execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const pinnedCommit = require('node:child_process').execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

    require('node:fs').writeFileSync(path.join(gitRepo, 'skills/hello-git-skill/SKILL.md'), '# Second version\n')
    require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git commit -m update', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync(`git clone --bare ${JSON.stringify(gitRepo)} ${JSON.stringify(remoteRepo)}`, {
      stdio: 'ignore',
    })
    const remoteUrl = `file://${remoteRepo}`

    const manifest: SkillsManifest = {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-git-skill': `${remoteUrl}#${pinnedCommit}&path:/skills/hello-git-skill`,
      },
    }

    const lockfile: SkillsLock = {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-git-skill': {
          specifier: `${remoteUrl}#${pinnedCommit}&path:/skills/hello-git-skill`,
          resolution: {
            type: 'git',
            url: remoteUrl,
            commit: pinnedCommit,
            path: '/skills/hello-git-skill',
          },
          digest: 'test-git-pinned-digest',
        },
      },
    }

    await fetchSkillsFromLock(root, manifest, lockfile)

    const installedSkill = path.join(root, '.agents/skills/hello-git-skill/SKILL.md')
    expect(existsSync(installedSkill)).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('First version')
  })

  it('updates stale lock entries from manifest before installing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-stale-lock-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-git-stale-source-'))

    require('node:fs').mkdirSync(path.join(gitRepo, 'skills/fixed-skill'), { recursive: true })
    require('node:fs').writeFileSync(path.join(gitRepo, 'skills/fixed-skill/SKILL.md'), '# Fixed skill\n')
    require('node:child_process').execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'fixed-skill': `${gitRepo}#HEAD&path:/skills/fixed-skill`,
      },
    })

    writeFileSync(
      path.join(root, 'skills-lock.yaml'),
      YAML.stringify({
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          '': {
            specifier: gitRepo,
            resolution: {
              type: 'git',
              url: gitRepo,
              commit: 'HEAD',
              path: '/',
            },
            digest: 'bad-digest',
          },
        },
      }),
    )

    await installSkills(root)

    const installedSkill = path.join(root, '.agents/skills/fixed-skill/SKILL.md')
    const rewrittenLock = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))

    expect(existsSync(installedSkill)).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Fixed skill')
    expect(rewrittenLock.skills['fixed-skill'].specifier).toBe(`${gitRepo}#HEAD&path:/skills/fixed-skill`)
    expect(rewrittenLock.skills['']).toBeUndefined()
  })

  it('removes managed skills that are no longer declared', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-prune-'))

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
        'obsolete-skill': `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
      },
    })

    await installSkills(root)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
      },
    })

    await installSkills(root)

    expect(existsSync(path.join(root, '.agents/skills/obsolete-skill'))).toBe(false)
    expect(existsSync(path.join(root, '.claude/skills/obsolete-skill'))).toBe(false)
    expect(existsSync(path.join(root, '.agents/skills/hello-skill'))).toBe(true)
  })

  describe('frozen-lockfile', () => {
    it('installs successfully when lock is in sync', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-ok-'))

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
            resolution: {
              type: 'file',
              path: path.resolve(__dirname, 'fixtures/local-source'),
            },
            digest: 'test-digest',
          },
        },
      })

      const result = await installSkills(root, { frozenLockfile: true })

      expect(result.status).toBe('installed')
      expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
    })

    it('throws when lockfile is missing in frozen mode', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-missing-'))

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
        },
      })

      await expect(installSkills(root, { frozenLockfile: true })).rejects.toThrow(
        'Lockfile is required in frozen mode'
      )
    })

    it('throws when lock is out of sync with manifest', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-outofsync-'))

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'different-skill': {
            specifier: `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
            resolution: {
              type: 'file',
              path: path.resolve(__dirname, 'fixtures/local-source'),
            },
            digest: 'test-digest',
          },
        },
      })

      await expect(installSkills(root, { frozenLockfile: true })).rejects.toThrow(
        'Lockfile is out of sync'
      )
    })

    it('does not modify lockfile in frozen mode', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-nomodify-'))

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `file:${path.resolve(__dirname, 'fixtures/local-source')}#path:/skills/hello-skill`,
            resolution: {
              type: 'file',
              path: path.resolve(__dirname, 'fixtures/local-source'),
            },
            digest: 'original-digest',
          },
        },
      })

      const lockBefore = readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8')
      await installSkills(root, { frozenLockfile: true })
      const lockAfter = readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8')

      expect(lockBefore).toBe(lockAfter)
    })
  })
})

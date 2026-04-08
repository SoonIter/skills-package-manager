import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import YAML from 'yaml'
import type { SkillsLock, SkillsManifest } from '../src/config/types'
import { writeSkillsLock } from '../src/config/writeSkillsLock'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { fetchSkillsFromLock, installSkills } from '../src/install/installSkills'
import { createSkillPackage, packDirectory, startMockNpmRegistry } from './helpers'

describe('installSkills', () => {
  it('installs a linked local skill and creates symlinks', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-'))
    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
      },
    })
    await writeSkillsLock(root, {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': {
          specifier: `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
          resolution: {
            type: 'link',
            path: path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill'),
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

  it('installs a file skill from a tgz package', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-file-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
    const tarballPath = packDirectory(packageRoot)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
      },
    })
    await writeSkillsLock(root, {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': {
          specifier: `file:${tarballPath}#path:/skills/hello-skill`,
          resolution: {
            type: 'file',
            tarball: path.relative(root, tarballPath),
            path: '/skills/hello-skill',
          },
          digest: 'test-file-digest',
        },
      },
    })

    await installSkills(root)

    const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
    expect(existsSync(installedSkill)).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello from tgz')
  })

  it('installs an npm skill from a packed package source', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-npm-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from npm package\n')
    const registry = await startMockNpmRegistry(packageRoot, { authToken: 'test-token' })

    try {
      writeFileSync(
        path.join(root, '.npmrc'),
        `registry=${registry.registryUrl}\n${registry.authTokenConfigLine}\n`,
      )
      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `npm:${registry.packageName}#path:/skills/hello-skill`,
        },
      })
      await writeSkillsLock(root, {
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
              registry: registry.registryUrl,
            },
            digest: 'test-npm-digest',
          },
        },
      })

      await installSkills(root, { frozenLockfile: true })

      const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
      expect(existsSync(installedSkill)).toBe(true)
      expect(readFileSync(installedSkill, 'utf8')).toContain('Hello from npm package')
    } finally {
      await registry.close()
    }
  })

  it('verifies npm tarball integrity before installing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-npm-integrity-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from npm package\n')
    const registry = await startMockNpmRegistry(packageRoot)

    try {
      writeFileSync(path.join(root, '.npmrc'), `registry=${registry.registryUrl}\n`)
      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `npm:${registry.packageName}#path:/skills/hello-skill`,
        },
      })
      await writeSkillsLock(root, {
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
              integrity: 'sha512-invalid',
              registry: registry.registryUrl,
            },
            digest: 'test-npm-digest',
          },
        },
      })

      await expect(installSkills(root, { frozenLockfile: true })).rejects.toThrow(
        'Integrity check failed',
      )
    } finally {
      await registry.close()
    }
  })

  it('installs a git skill from a local git repository', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-git-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-git-source-'))

    require('node:fs').mkdirSync(path.join(gitRepo, 'skills/hello-git-skill'), { recursive: true })
    require('node:fs').writeFileSync(
      path.join(gitRepo, 'skills/hello-git-skill/SKILL.md'),
      '# Hello from git\n',
    )
    require('node:child_process').execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.email test@example.com', {
      cwd: gitRepo,
      stdio: 'ignore',
    })
    require('node:child_process').execSync('git config user.name test', {
      cwd: gitRepo,
      stdio: 'ignore',
    })
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
    require('node:fs').writeFileSync(
      path.join(gitRepo, 'skills/hello-git-skill/SKILL.md'),
      '# First version\n',
    )
    require('node:child_process').execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.email test@example.com', {
      cwd: gitRepo,
      stdio: 'ignore',
    })
    require('node:child_process').execSync('git config user.name test', {
      cwd: gitRepo,
      stdio: 'ignore',
    })
    require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const pinnedCommit = require('node:child_process')
      .execSync('git rev-parse HEAD', { cwd: gitRepo })
      .toString()
      .trim()

    require('node:fs').writeFileSync(
      path.join(gitRepo, 'skills/hello-git-skill/SKILL.md'),
      '# Second version\n',
    )
    require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git commit -m update', {
      cwd: gitRepo,
      stdio: 'ignore',
    })
    require('node:child_process').execSync(
      `git clone --bare ${JSON.stringify(gitRepo)} ${JSON.stringify(remoteRepo)}`,
      {
        stdio: 'ignore',
      },
    )
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
    require('node:fs').writeFileSync(
      path.join(gitRepo, 'skills/fixed-skill/SKILL.md'),
      '# Fixed skill\n',
    )
    require('node:child_process').execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    require('node:child_process').execSync('git config user.email test@example.com', {
      cwd: gitRepo,
      stdio: 'ignore',
    })
    require('node:child_process').execSync('git config user.name test', {
      cwd: gitRepo,
      stdio: 'ignore',
    })
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
    expect(rewrittenLock.skills['fixed-skill'].specifier).toBe(
      `${gitRepo}#HEAD&path:/skills/fixed-skill`,
    )
    expect(rewrittenLock.skills['']).toBeUndefined()
  })

  it('removes managed skills that are no longer declared', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-prune-'))

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
        'obsolete-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
      },
    })

    await installSkills(root)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
      },
    })

    await installSkills(root)

    expect(existsSync(path.join(root, '.agents/skills/obsolete-skill'))).toBe(false)
    expect(existsSync(path.join(root, '.claude/skills/obsolete-skill'))).toBe(false)
    expect(existsSync(path.join(root, '.agents/skills/hello-skill'))).toBe(true)
  })

  it('reinstalls missing managed skills even when the lock digest is unchanged', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-reinstall-missing-'))
    const specifier = `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': specifier,
      },
    })

    await installSkills(root)
    unlinkSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))

    await installSkills(root)

    expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
  })

  it('replaces installed skill directories so deleted source files do not linger', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-replace-dir-'))
    const sourceRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-replace-dir-source-'))
    const skillDir = path.join(sourceRoot, 'hello-skill')

    require('node:fs').mkdirSync(skillDir, { recursive: true })
    writeFileSync(path.join(skillDir, 'SKILL.md'), '# Hello\n')
    writeFileSync(path.join(skillDir, 'legacy.txt'), 'legacy\n')

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `link:${skillDir}`,
      },
    })

    await installSkills(root)
    rmSync(path.join(skillDir, 'legacy.txt'))

    await installSkills(root)

    expect(existsSync(path.join(root, '.agents/skills/hello-skill/legacy.txt'))).toBe(false)
  })

  describe('frozen-lockfile', () => {
    it('installs successfully when lock is in sync', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-ok-'))

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
            resolution: {
              type: 'link',
              path: path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill'),
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
          'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
        },
      })

      await expect(installSkills(root, { frozenLockfile: true })).rejects.toThrow(
        'Lockfile is required in frozen mode',
      )
    })

    it('throws when lock is out of sync with manifest', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-outofsync-'))

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'different-skill': {
            specifier: `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
            resolution: {
              type: 'link',
              path: path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill'),
            },
            digest: 'test-digest',
          },
        },
      })

      await expect(installSkills(root, { frozenLockfile: true })).rejects.toThrow(
        'Lockfile is out of sync',
      )
    })

    it('does not modify lockfile in frozen mode', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-nomodify-'))

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
            resolution: {
              type: 'link',
              path: path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill'),
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

    it('accepts lock with commit when manifest has no ref', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-noref-'))
      const localSource = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')

      // Manifest without ref (no commit SHA)
      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `link:${localSource}`,
        },
      })

      // Lock with a resolved "commit" (for file type, this is just a different format)
      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `link:${localSource}`,
            resolution: {
              type: 'link',
              path: localSource,
            },
            digest: 'resolved-digest',
          },
        },
      })

      const result = await installSkills(root, { frozenLockfile: true })

      expect(result.status).toBe('installed')
      expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
    })

    it('throws when manifest ref differs from lock ref', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-ref-diff-'))
      const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-ref-git-'))

      require('node:fs').mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
      require('node:fs').writeFileSync(
        path.join(gitRepo, 'skills/hello-skill/SKILL.md'),
        '# Hello\n',
      )
      require('node:child_process').execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
      require('node:child_process').execSync('git config user.email test@example.com', {
        cwd: gitRepo,
        stdio: 'ignore',
      })
      require('node:child_process').execSync('git config user.name test', {
        cwd: gitRepo,
        stdio: 'ignore',
      })
      require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
      require('node:child_process').execSync('git commit -m init', {
        cwd: gitRepo,
        stdio: 'ignore',
      })
      const commit1 = require('node:child_process')
        .execSync('git rev-parse HEAD', { cwd: gitRepo })
        .toString()
        .trim()

      require('node:fs').writeFileSync(
        path.join(gitRepo, 'skills/hello-skill/SKILL.md'),
        '# Updated\n',
      )
      require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
      require('node:child_process').execSync('git commit -m update', {
        cwd: gitRepo,
        stdio: 'ignore',
      })
      const commit2 = require('node:child_process')
        .execSync('git rev-parse HEAD', { cwd: gitRepo })
        .toString()
        .trim()

      // Manifest specifies first commit
      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `${gitRepo}#${commit1}&path:/skills/hello-skill`,
        },
      })

      // Lock has second commit
      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `${gitRepo}#${commit2}&path:/skills/hello-skill`,
            resolution: {
              type: 'git',
              url: gitRepo,
              commit: commit2,
              path: '/skills/hello-skill',
            },
            digest: 'digest-2',
          },
        },
      })

      await expect(installSkills(root, { frozenLockfile: true })).rejects.toThrow(
        'Lockfile is out of sync',
      )
    })

    it('accepts when manifest ref matches lock ref exactly', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-ref-match-'))
      const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-ref-match-git-'))

      require('node:fs').mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
      require('node:fs').writeFileSync(
        path.join(gitRepo, 'skills/hello-skill/SKILL.md'),
        '# Hello\n',
      )
      require('node:child_process').execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
      require('node:child_process').execSync('git config user.email test@example.com', {
        cwd: gitRepo,
        stdio: 'ignore',
      })
      require('node:child_process').execSync('git config user.name test', {
        cwd: gitRepo,
        stdio: 'ignore',
      })
      require('node:child_process').execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
      require('node:child_process').execSync('git commit -m init', {
        cwd: gitRepo,
        stdio: 'ignore',
      })
      const commit = require('node:child_process')
        .execSync('git rev-parse HEAD', { cwd: gitRepo })
        .toString()
        .trim()

      // Manifest and lock both specify same commit
      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `${gitRepo}#${commit}&path:/skills/hello-skill`,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `${gitRepo}#${commit}&path:/skills/hello-skill`,
            resolution: {
              type: 'git',
              url: gitRepo,
              commit: commit,
              path: '/skills/hello-skill',
            },
            digest: 'digest',
          },
        },
      })

      const result = await installSkills(root, { frozenLockfile: true })

      expect(result.status).toBe('installed')
      expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
    })

    it('emits resolved/added/installed progress events in frozen mode', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-progress-'))
      const sourceRoot = path.resolve(__dirname, 'fixtures/local-source')

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `file:${sourceRoot}#path:/skills/hello-skill`,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier: `file:${sourceRoot}#path:/skills/hello-skill`,
            resolution: {
              type: 'file',
              path: sourceRoot,
            },
            digest: 'digest',
          },
        },
      })

      const events: string[] = []
      await installSkills(root, {
        frozenLockfile: true,
        onProgress: (event) => {
          events.push(`${event.type}:${event.skillName}`)
        },
      })

      expect(events).toEqual(['resolved:hello-skill', 'added:hello-skill', 'installed:hello-skill'])
    })
  })
})

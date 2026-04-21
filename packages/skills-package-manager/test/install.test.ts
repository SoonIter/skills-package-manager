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
import { installCommand } from '../src/commands/install'
import type { SkillsLock, SkillsManifest } from '../src/config/types'
import { writeSkillsLock } from '../src/config/writeSkillsLock'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { runPipeline } from '../src/pipeline'
import { loadConfig } from '../src/pipeline/context'
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

    await installCommand({ cwd: root })

    const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
    const linkedSkill = path.join(root, '.claude/skills/hello-skill')
    expect(existsSync(installedSkill)).toBe(true)
    expect(lstatSync(linkedSkill).isSymbolicLink()).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello skill')
  })

  it('does not install the bundled self skill when selfSkill is omitted', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-self-skill-default-off-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify({ installDir: '.agents/skills', linkTargets: [], skills: {} }, null, 2),
    )

    await installCommand({ cwd: root })

    const installedSkill = path.join(root, '.agents/skills/skills-package-manager-cli/SKILL.md')
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))

    expect(existsSync(installedSkill)).toBe(false)
    expect(lockfile.skills['skills-package-manager-cli']).toBeUndefined()
  })

  it('installs the bundled self skill when selfSkill is true', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-self-skill-enabled-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        { installDir: '.agents/skills', linkTargets: [], selfSkill: true, skills: {} },
        null,
        2,
      ),
    )

    await installCommand({ cwd: root })

    const installedSkill = path.join(root, '.agents/skills/skills-package-manager-cli/SKILL.md')
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))

    expect(existsSync(installedSkill)).toBe(true)
    expect(lockfile.skills['skills-package-manager-cli']).toBeUndefined()
  })

  it('installs the bundled self skill in frozen mode without requiring a lock entry', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-self-skill-frozen-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        { installDir: '.agents/skills', linkTargets: [], selfSkill: true, skills: {} },
        null,
        2,
      ),
    )
    await writeSkillsLock(root, {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {},
    })

    await installCommand({ cwd: root, frozenLockfile: true })

    const installedSkill = path.join(root, '.agents/skills/skills-package-manager-cli/SKILL.md')
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))

    expect(existsSync(installedSkill)).toBe(true)
    expect(lockfile.skills['skills-package-manager-cli']).toBeUndefined()
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

    await installCommand({ cwd: root })

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

      await installCommand({ cwd: root, frozenLockfile: true })

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

      await expect(installCommand({ cwd: root, frozenLockfile: true })).rejects.toThrow(
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

    await installCommand({ cwd: root })

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

    await runPipeline({ ctx: await loadConfig(root), entries: lockfile.skills, skipResolve: true })

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

    await installCommand({ cwd: root })

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

    await installCommand({ cwd: root })

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
      },
    })

    await installCommand({ cwd: root })

    expect(existsSync(path.join(root, '.agents/skills/obsolete-skill'))).toBe(false)
    expect(existsSync(path.join(root, '.claude/skills/obsolete-skill'))).toBe(false)
    expect(existsSync(path.join(root, '.agents/skills/hello-skill'))).toBe(true)
  })

  it('reinstalls missing managed skills even when the lock digest is unchanged', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-reinstall-missing-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
    const tarballPath = packDirectory(packageRoot)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
      },
    })

    await installCommand({ cwd: root })
    unlinkSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))

    await installCommand({ cwd: root })

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

    await installCommand({ cwd: root })
    rmSync(path.join(skillDir, 'legacy.txt'))

    await installCommand({ cwd: root })

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

      const result = await installCommand({ cwd: root, frozenLockfile: true })

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

      await expect(installCommand({ cwd: root, frozenLockfile: true })).rejects.toThrow(
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

      await expect(installCommand({ cwd: root, frozenLockfile: true })).rejects.toThrow(
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
      await installCommand({ cwd: root, frozenLockfile: true })
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

      const result = await installCommand({ cwd: root, frozenLockfile: true })

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

      await expect(installCommand({ cwd: root, frozenLockfile: true })).rejects.toThrow(
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

      const result = await installCommand({ cwd: root, frozenLockfile: true })

      expect(result.status).toBe('installed')
      expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
    })

    it('emits resolved/added/installed progress events in frozen mode', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-progress-'))
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
            digest: 'digest',
          },
        },
      })

      const events: string[] = []
      await installCommand({
        cwd: root,
        frozenLockfile: true,
        onProgress: (event) => {
          events.push(`${event.type}:${event.skillName}`)
        },
      })

      expect(events).toEqual(['resolved:hello-skill', 'added:hello-skill', 'installed:hello-skill'])
    })

    it('short-circuits when install state is up-to-date', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-uptodate-'))
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
            digest: 'digest',
          },
        },
      })

      // First install to materialize files and install state
      await installCommand({ cwd: root, frozenLockfile: true })
      expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)

      // Second install should short-circuit: no added events, only resolved + installed
      const events: string[] = []
      await installCommand({
        cwd: root,
        frozenLockfile: true,
        onProgress: (event) => {
          events.push(`${event.type}:${event.skillName}`)
        },
      })

      expect(events).toEqual(['resolved:hello-skill', 'installed:hello-skill'])
    })

    it('does not short-circuit when skill files are missing', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-missing-skill-'))
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
            digest: 'digest',
          },
        },
      })

      // First install
      await installCommand({ cwd: root, frozenLockfile: true })

      // Delete the installed skill to break the up-to-date check
      rmSync(path.join(root, '.agents/skills/hello-skill'), { recursive: true, force: true })

      // Second install should NOT short-circuit; it must re-fetch and re-link
      const events: string[] = []
      await installCommand({
        cwd: root,
        frozenLockfile: true,
        onProgress: (event) => {
          events.push(`${event.type}:${event.skillName}`)
        },
      })

      expect(events).toEqual(['resolved:hello-skill', 'added:hello-skill', 'installed:hello-skill'])
      expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
    })

    it('does not short-circuit when lockfile digest changes', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-frozen-digest-changed-'))
      const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
      const packageRoot2 = createSkillPackage('hello-skill', '# Updated content\n')
      const tarballPath = packDirectory(packageRoot)
      const tarballPath2 = packDirectory(packageRoot2)
      const specifier = `file:${tarballPath}#path:/skills/hello-skill`

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': specifier,
        },
      })

      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier,
            resolution: {
              type: 'file',
              tarball: path.relative(root, tarballPath),
              path: '/skills/hello-skill',
            },
            digest: 'digest',
          },
        },
      })

      // Install the old version
      await installCommand({ cwd: root, frozenLockfile: true })
      const oldContent = readFileSync(
        path.join(root, '.agents/skills/hello-skill/SKILL.md'),
        'utf8',
      )
      expect(oldContent).toContain('Hello from tgz')

      // Update lockfile resolution while keeping specifier compatible
      // (manifest specifier stays the same, so isLockInSync still passes)
      await writeSkillsLock(root, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': {
            specifier,
            resolution: {
              type: 'file',
              tarball: path.relative(root, tarballPath2),
              path: '/skills/hello-skill',
            },
            digest: 'digest2',
          },
        },
      })

      // Install again — should NOT short-circuit because lock digest changed
      await installCommand({ cwd: root, frozenLockfile: true })
      const newContent = readFileSync(
        path.join(root, '.agents/skills/hello-skill/SKILL.md'),
        'utf8',
      )
      expect(newContent).toContain('Updated content')
    })
  })

  describe('install-dir lock copy', () => {
    it('writes a skills-lock.yaml copy into installDir after install', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-dir-lock-'))
      const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
      const tarballPath = packDirectory(packageRoot)

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
        },
      })

      await installCommand({ cwd: root })

      const installDirLockPath = path.join(root, '.agents/skills', 'lock.yaml')
      expect(existsSync(installDirLockPath)).toBe(true)
      const installDirLock = YAML.parse(readFileSync(installDirLockPath, 'utf8'))
      expect(installDirLock.skills['hello-skill']).toBeDefined()
    })

    it('skips resolve when installDir lock copy matches root lockfile for npm skills', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-npm-fast-path-'))
      const packageRoot = createSkillPackage('hello-skill', '# Hello npm\n')
      const registry = await startMockNpmRegistry(packageRoot)

      try {
        writeFileSync(path.join(root, '.npmrc'), `registry=${registry.registryUrl}\n`)
        await writeSkillsManifest(root, {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'hello-skill': `npm:${registry.packageName}@1.0.0#path:/skills/hello-skill`,
          },
        })

        // First install (cold)
        await installCommand({ cwd: root })
        expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)

        // Second install should skip resolve entirely
        const events: string[] = []
        const logs: string[] = []
        const originalInfo = console.info
        console.info = (...args: unknown[]) => {
          logs.push(args.join(' '))
        }

        await installCommand({
          cwd: root,
          onProgress: (event) => {
            events.push(`${event.type}:${event.skillName}`)
          },
        })

        console.info = originalInfo

        expect(logs).toContain('Skills Lockfile is up to date, resolve skipped')
        // No added event because runPipeline up-to-date short-circuit also kicks in
        expect(events).toEqual(['resolved:hello-skill', 'installed:hello-skill'])
      } finally {
        await registry.close()
      }
    })

    it('skips resolve for link skills when installDir copy matches', async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-link-fast-path-'))
      const skillDir = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')

      await writeSkillsManifest(root, {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-skill': `link:${skillDir}`,
        },
      })

      // First install
      await installCommand({ cwd: root })

      // Second install — should skip resolve because link uses symlinks
      const logs: string[] = []
      const originalInfo = console.info
      console.info = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }

      await installCommand({ cwd: root })

      console.info = originalInfo

      expect(logs).toContain('Skills Lockfile is up to date, resolve skipped')
    })
  })
})

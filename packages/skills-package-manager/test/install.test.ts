import { execSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { installCommand } from '../src/commands/install'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { resolveGitCommit } from '../src/resolvers/git'
import { createSkillPackage, packDirectory, startMockNpmRegistry } from './helpers'

function expectNoLockFiles(root: string) {
  expect(existsSync(path.join(root, 'skills-lock.yaml'))).toBe(false)
  expect(existsSync(path.join(root, '.agents/skills/lock.yaml'))).toBe(false)
  expect(existsSync(path.join(root, '.agents/skills/.skills-pm-install-state.json'))).toBe(false)
}

function createGitSkillRepo(content: string) {
  const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-git-source-'))
  mkdirSync(path.join(gitRepo, 'skills/hello-git-skill'), { recursive: true })
  writeFileSync(path.join(gitRepo, 'skills/hello-git-skill/SKILL.md'), content)
  execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
  return {
    gitRepo,
    commit: execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim(),
  }
}

describe('installCommand', () => {
  it('installs a linked local skill, creates symlinks, and writes no lock files', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-'))
    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
      },
    })

    await installCommand({ cwd: root })

    const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
    const linkedSkill = path.join(root, '.claude/skills/hello-skill')
    expect(existsSync(installedSkill)).toBe(true)
    expect(lstatSync(linkedSkill).isSymbolicLink()).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello skill')
    expectNoLockFiles(root)
  })

  it('supports local:* for existing user-owned skills under installDir', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-local-star-'))
    const skillDir = path.join(root, '.agents/skills/my-skill')

    mkdirSync(skillDir, { recursive: true })
    writeFileSync(path.join(skillDir, 'SKILL.md'), '# My skill\n')
    writeFileSync(path.join(skillDir, 'notes.md'), 'keep me\n')
    writeFileSync(path.join(root, '.gitignore'), '.agents/**\n')

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'my-skill': 'local:*',
      },
    })

    await installCommand({ cwd: root })
    await installCommand({ cwd: root })

    const linkedSkill = path.join(root, '.claude/skills/my-skill')
    const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
    expect(readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')).toBe('# My skill\n')
    expect(readFileSync(path.join(skillDir, 'notes.md'), 'utf8')).toBe('keep me\n')
    expect(lstatSync(linkedSkill).isSymbolicLink()).toBe(true)
    expect(path.resolve(path.dirname(linkedSkill), readlinkSync(linkedSkill))).toBe(skillDir)
    expect(gitignore.match(/!\.agents\/skills\/my-skill\/\*\*/g)).toHaveLength(1)
    expectNoLockFiles(root)
  })

  it('bootstraps an empty skills.json for a new project when the manifest is missing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-bootstrap-empty-'))

    await installCommand({ cwd: root })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(manifest.installDir).toBe('.agents/skills')
    expect(manifest.linkTargets).toEqual([])
    expect(manifest.skills).toEqual({})
    expectNoLockFiles(root)
  })

  it('bootstraps skills.json from existing installed skills when the manifest is missing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-bootstrap-'))
    const firstSkillDir = path.join(root, '.agents/skills/first-skill')
    const secondSkillDir = path.join(root, '.agents/skills/second-skill')

    mkdirSync(firstSkillDir, { recursive: true })
    mkdirSync(secondSkillDir, { recursive: true })
    mkdirSync(path.join(root, '.agents/skills/not-a-skill'), { recursive: true })
    mkdirSync(path.join(root, '.claude/skills/first-skill'), { recursive: true })
    writeFileSync(path.join(firstSkillDir, 'SKILL.md'), '# First skill\n')
    writeFileSync(path.join(secondSkillDir, 'SKILL.md'), '# Second skill\n')
    writeFileSync(path.join(root, '.claude/skills/first-skill/SKILL.md'), '# Stale copy\n')
    writeFileSync(path.join(root, '.gitignore'), '.agents/**\n')

    await installCommand({ cwd: root })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    const linkedSkill = path.join(root, '.claude/skills/first-skill')
    const gitignore = readFileSync(path.join(root, '.gitignore'), 'utf8')

    expect(manifest.installDir).toBe('.agents/skills')
    expect(manifest.linkTargets).toEqual(['.claude/skills'])
    expect(manifest.skills).toEqual({
      'first-skill': 'local:*',
      'second-skill': 'local:*',
    })
    expect(readFileSync(path.join(firstSkillDir, 'SKILL.md'), 'utf8')).toBe('# First skill\n')
    expect(lstatSync(linkedSkill).isSymbolicLink()).toBe(true)
    expect(path.resolve(path.dirname(linkedSkill), readlinkSync(linkedSkill))).toBe(firstSkillDir)
    expect(gitignore).toContain('!.agents/skills/first-skill/**')
    expect(gitignore).toContain('!.agents/skills/second-skill/**')
    expectNoLockFiles(root)
  })

  it('uses skills-lock.json names when bootstrapping a Vercel skills install', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-bootstrap-lock-'))

    mkdirSync(path.join(root, '.agents/skills/from-lock'), { recursive: true })
    mkdirSync(path.join(root, '.agents/skills/untracked'), { recursive: true })
    writeFileSync(path.join(root, '.agents/skills/from-lock/SKILL.md'), '# From lock\n')
    writeFileSync(path.join(root, '.agents/skills/untracked/SKILL.md'), '# Untracked\n')
    writeFileSync(
      path.join(root, 'skills-lock.json'),
      JSON.stringify(
        {
          version: 1,
          skills: {
            'from-lock': {
              source: 'vercel-labs/agent-skills',
              sourceType: 'github',
              computedHash: 'abc123',
            },
            missing: {
              source: 'vercel-labs/agent-skills',
              sourceType: 'github',
              computedHash: 'def456',
            },
          },
        },
        null,
        2,
      ),
    )

    await installCommand({ cwd: root })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(manifest.skills).toEqual({
      'from-lock': 'local:*',
    })
    expect(existsSync(path.join(root, '.agents/skills/untracked/SKILL.md'))).toBe(true)
  })

  it('bootstraps from .agent/skills when that install directory already exists', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-bootstrap-agent-'))
    const skillDir = path.join(root, '.agent/skills/my-skill')

    mkdirSync(skillDir, { recursive: true })
    mkdirSync(path.join(root, '.claude/skills'), { recursive: true })
    writeFileSync(path.join(skillDir, 'SKILL.md'), '# My skill\n')

    await installCommand({ cwd: root })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    const linkedSkill = path.join(root, '.claude/skills/my-skill')
    expect(manifest.installDir).toBe('.agent/skills')
    expect(manifest.linkTargets).toEqual(['.claude/skills'])
    expect(manifest.skills).toEqual({
      'my-skill': 'local:*',
    })
    expect(lstatSync(linkedSkill).isSymbolicLink()).toBe(true)
    expect(path.resolve(path.dirname(linkedSkill), readlinkSync(linkedSkill))).toBe(skillDir)
  })

  it('clears stale managed markers when adopting a local:* skill', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-local-marker-'))
    const skillDir = path.join(root, '.agents/skills/my-skill')

    mkdirSync(skillDir, { recursive: true })
    writeFileSync(path.join(skillDir, 'SKILL.md'), '# My skill\n')
    writeFileSync(path.join(skillDir, 'notes.md'), 'keep me\n')
    writeFileSync(
      path.join(skillDir, '.skills-pm.json'),
      JSON.stringify({ name: 'my-skill', installedBy: 'skills-package-manager' }),
    )

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'my-skill': 'local:*',
      },
    })

    await installCommand({ cwd: root })

    expect(existsSync(path.join(skillDir, '.skills-pm.json'))).toBe(false)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {},
    })
    await installCommand({ cwd: root })

    expect(existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true)
    expect(readFileSync(path.join(skillDir, 'notes.md'), 'utf8')).toBe('keep me\n')
    expectNoLockFiles(root)
  })

  it('throws when a local skill directory is missing SKILL.md', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-local-invalid-'))
    mkdirSync(path.join(root, '.agents/skills/my-skill'), { recursive: true })

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'my-skill': 'local:*',
      },
    })

    await expect(installCommand({ cwd: root })).rejects.toThrow('missing SKILL.md')
  })

  it('throws when a local skill has a patch configured', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-local-patch-'))
    const skillDir = path.join(root, '.agents/skills/my-skill')

    mkdirSync(skillDir, { recursive: true })
    mkdirSync(path.join(root, 'patches'), { recursive: true })
    writeFileSync(path.join(skillDir, 'SKILL.md'), '# My skill\n')
    writeFileSync(path.join(root, 'patches/my-skill.patch'), 'diff --git a/SKILL.md b/SKILL.md\n')

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'my-skill': 'local:*',
      },
      patchedSkills: {
        'my-skill': 'patches/my-skill.patch',
      },
    })

    await expect(installCommand({ cwd: root })).rejects.toThrow('cannot be patched')
  })

  it('does not install the bundled self skill when selfSkill is omitted', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-self-skill-default-off-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify({ installDir: '.agents/skills', linkTargets: [], skills: {} }, null, 2),
    )

    await installCommand({ cwd: root })

    expect(existsSync(path.join(root, '.agents/skills/skills-package-manager-cli/SKILL.md'))).toBe(
      false,
    )
    expectNoLockFiles(root)
  })

  it('installs the bundled self skill when selfSkill is true without writing it to skills.json', async () => {
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

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(existsSync(path.join(root, '.agents/skills/skills-package-manager-cli/SKILL.md'))).toBe(
      true,
    )
    expect(manifest.skills['skills-package-manager-cli']).toBeUndefined()
    expectNoLockFiles(root)
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

    await installCommand({ cwd: root })

    const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
    expect(existsSync(installedSkill)).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello from tgz')
    expectNoLockFiles(root)
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
          'hello-skill': `npm:${registry.packageName}@${registry.version}&path:skills/hello-skill`,
        },
      })

      await installCommand({ cwd: root })

      const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
      expect(existsSync(installedSkill)).toBe(true)
      expect(readFileSync(installedSkill, 'utf8')).toContain('Hello from npm package')
      expectNoLockFiles(root)
    } finally {
      await registry.close()
    }
  })

  it('installs a git skill pinned to a commit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-git-pinned-'))
    const { gitRepo, commit } = createGitSkillRepo('# Hello from git\n')

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-git-skill': `${gitRepo}#${commit}&path:/skills/hello-git-skill`,
      },
    })

    await installCommand({ cwd: root })

    const installedSkill = path.join(root, '.agents/skills/hello-git-skill/SKILL.md')
    expect(existsSync(installedSkill)).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello from git')
    expectNoLockFiles(root)
  })

  it('resolves full git commit pins without querying the remote ref', async () => {
    const commit = 'a'.repeat(40)

    await expect(resolveGitCommit('https://example.invalid/repo.git', commit)).resolves.toBe(commit)
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
    expectNoLockFiles(root)
  })

  it('reinstalls missing managed skill files', async () => {
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
    expectNoLockFiles(root)
  })

  it('reuses already materialized managed skills without writing persistent state', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-uptodate-'))
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

    const events: string[] = []
    await installCommand({
      cwd: root,
      onProgress: (event) => {
        events.push(`${event.type}:${event.skillName}`)
      },
    })

    expect(events).toEqual(['resolved:hello-skill', 'installed:hello-skill'])
    expectNoLockFiles(root)
  })

  it('reinstalls when managed skill directories are missing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-missing-skill-'))
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
    rmSync(path.join(root, '.agents/skills/hello-skill'), { recursive: true, force: true })

    const events: string[] = []
    await installCommand({
      cwd: root,
      onProgress: (event) => {
        events.push(`${event.type}:${event.skillName}`)
      },
    })

    expect(events).toEqual(['resolved:hello-skill', 'added:hello-skill', 'installed:hello-skill'])
    expect(existsSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'))).toBe(true)
    expectNoLockFiles(root)
  })
})

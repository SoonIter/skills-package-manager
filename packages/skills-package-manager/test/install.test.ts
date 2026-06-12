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

function createLocalSkill(root: string, skillName: string, content: string): string {
  const skillDir = path.join(root, 'sources', skillName)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(path.join(skillDir, 'SKILL.md'), content)
  return `link:./sources/${skillName}`
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

  it('auto-locks and installs dependencies declared in SKILL.md frontmatter', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-'))
    const dependencySpecifier = createLocalSkill(root, 'dep-skill', '# Dependency\n')
    const rootSpecifier = createLocalSkill(
      root,
      'root-skill',
      `---
dependencies:
  dep-skill: "${dependencySpecifier}"
---
# Root
`,
    )

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'root-skill': rootSpecifier,
      },
    })

    const result = await installCommand({ cwd: root })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(result.installed).toEqual(['root-skill', 'dep-skill'])
    expect(result.warnings).toEqual([])
    expect(manifest.dependencies).toEqual({
      'dep-skill': dependencySpecifier,
    })
    expect(manifest.selfSkill).toBeUndefined()
    expect(existsSync(path.join(root, '.agents/skills/dep-skill/SKILL.md'))).toBe(true)
    expect(lstatSync(path.join(root, '.claude/skills/dep-skill')).isSymbolicLink()).toBe(true)
    expectNoLockFiles(root)
  })

  it('pins git dependencies when writing skills.json dependencies', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-git-'))
    const { gitRepo, commit } = createGitSkillRepo('# Git dependency\n')
    const rootSpecifier = createLocalSkill(
      root,
      'root-skill',
      `---
dependencies:
  hello-git-skill: "${gitRepo}#main&path:/skills/hello-git-skill"
---
# Root
`,
    )

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'root-skill': rootSpecifier,
      },
    })

    await installCommand({ cwd: root })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(manifest.dependencies).toEqual({
      'hello-git-skill': `${gitRepo}#${commit}&path:/skills/hello-git-skill`,
    })
    expect(readFileSync(path.join(root, '.agents/skills/hello-git-skill/SKILL.md'), 'utf8')).toBe(
      '# Git dependency\n',
    )
  })

  it('uses manifest dependency overrides instead of frontmatter specifiers', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-override-'))
    const frontmatterDependency = createLocalSkill(root, 'frontmatter-dep', '# Frontmatter dep\n')
    const manifestDependency = createLocalSkill(root, 'manifest-dep', '# Manifest dep\n')
    const rootSpecifier = createLocalSkill(
      root,
      'root-skill',
      `---
dependencies:
  shared-dep: "${frontmatterDependency}"
---
# Root
`,
    )

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'root-skill': rootSpecifier,
      },
      dependencies: {
        'shared-dep': manifestDependency,
      },
    })

    await installCommand({ cwd: root })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(manifest.dependencies).toEqual({
      'shared-dep': manifestDependency,
    })
    expect(readFileSync(path.join(root, '.agents/skills/shared-dep/SKILL.md'), 'utf8')).toBe(
      '# Manifest dep\n',
    )
  })

  it('keeps root skills authoritative when frontmatter declares the same dependency name', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-root-wins-'))
    const ignoredDependency = createLocalSkill(root, 'ignored-root-b', '# Ignored root B\n')
    const rootB = createLocalSkill(root, 'root-b-source', '# Explicit root B\n')
    const rootA = createLocalSkill(
      root,
      'root-a',
      `---
dependencies:
  root-b: "${ignoredDependency}"
---
# Root A
`,
    )

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'root-a': rootA,
        'root-b': rootB,
      },
    })

    await installCommand({ cwd: root })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(manifest.dependencies).toBeUndefined()
    expect(readFileSync(path.join(root, '.agents/skills/root-b/SKILL.md'), 'utf8')).toBe(
      '# Explicit root B\n',
    )
  })

  it('keeps the first frontmatter dependency specifier and warns on conflicts', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-conflict-'))
    const firstDependency = createLocalSkill(root, 'first-dep', '# First dep\n')
    const secondDependency = createLocalSkill(root, 'second-dep', '# Second dep\n')
    const firstRoot = createLocalSkill(
      root,
      'first-root',
      `---
dependencies:
  shared-dep: "${firstDependency}"
---
# First root
`,
    )
    const secondRoot = createLocalSkill(
      root,
      'second-root',
      `---
dependencies:
  shared-dep: "${secondDependency}"
---
# Second root
`,
    )
    const warnings: string[] = []

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'first-root': firstRoot,
        'second-root': secondRoot,
      },
    })

    const result = await installCommand({
      cwd: root,
      onWarning: (warning) => warnings.push(warning.message),
    })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(result.warnings).toHaveLength(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('using the first specifier')
    expect(manifest.dependencies).toEqual({
      'shared-dep': firstDependency,
    })
    expect(readFileSync(path.join(root, '.agents/skills/shared-dep/SKILL.md'), 'utf8')).toBe(
      '# First dep\n',
    )
  })

  it('resolves recursive dependencies once when the graph contains a cycle', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-cycle-'))
    const depASpecifier = createLocalSkill(
      root,
      'dep-a',
      `---
dependencies:
  dep-b: "link:./sources/dep-b"
---
# Dep A
`,
    )
    createLocalSkill(
      root,
      'dep-b',
      `---
dependencies:
  dep-a: "link:./sources/dep-a"
---
# Dep B
`,
    )
    const rootSpecifier = createLocalSkill(
      root,
      'root-skill',
      `---
dependencies:
  dep-a: "${depASpecifier}"
---
# Root
`,
    )

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'root-skill': rootSpecifier,
      },
    })

    const result = await installCommand({ cwd: root })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(result.installed).toEqual(['root-skill', 'dep-a', 'dep-b'])
    expect(manifest.dependencies).toEqual({
      'dep-a': 'link:./sources/dep-a',
      'dep-b': 'link:./sources/dep-b',
    })
    expect(existsSync(path.join(root, '.agents/skills/dep-a/SKILL.md'))).toBe(true)
    expect(existsSync(path.join(root, '.agents/skills/dep-b/SKILL.md'))).toBe(true)
  })

  it('prunes stale dependency locks and installed dependency skills', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-prune-'))
    const dependencySpecifier = createLocalSkill(root, 'dep-skill', '# Dependency\n')
    const rootSkillDir = path.join(root, 'sources/root-skill')
    mkdirSync(rootSkillDir, { recursive: true })
    writeFileSync(
      path.join(rootSkillDir, 'SKILL.md'),
      `---
dependencies:
  dep-skill: "${dependencySpecifier}"
---
# Root
`,
    )

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'root-skill': 'link:./sources/root-skill',
      },
    })

    await installCommand({ cwd: root })
    writeFileSync(path.join(rootSkillDir, 'SKILL.md'), '# Root\n')
    await installCommand({ cwd: root })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(manifest.dependencies).toBeUndefined()
    expect(existsSync(path.join(root, '.agents/skills/dep-skill'))).toBe(false)
    expect(existsSync(path.join(root, '.claude/skills/dep-skill'))).toBe(false)
  })

  it('warns and skips invalid frontmatter dependencies', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-invalid-'))
    const rootSpecifier = createLocalSkill(
      root,
      'root-skill',
      `---
dependencies:
  bad-shape: 123
  bad-specifier: "link:./sources/bad#main"
---
# Root
`,
    )
    const warnings: string[] = []

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'root-skill': rootSpecifier,
      },
    })

    const result = await installCommand({
      cwd: root,
      onWarning: (warning) => warnings.push(warning.message),
    })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(result.installed).toEqual(['root-skill'])
    expect(result.warnings).toHaveLength(2)
    expect(warnings).toHaveLength(2)
    expect(manifest.dependencies).toBeUndefined()
  })

  it('reads dependencies from patched SKILL.md frontmatter', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-install-deps-patch-'))
    const dependencySpecifier = createLocalSkill(root, 'dep-skill', '# Dependency\n')
    const packageRoot = createSkillPackage('root-skill', '# Root\n')
    const tarballPath = packDirectory(packageRoot)
    mkdirSync(path.join(root, 'patches'), { recursive: true })
    writeFileSync(
      path.join(root, 'patches/root-skill.patch'),
      `diff --git a/SKILL.md b/SKILL.md
--- a/SKILL.md
+++ b/SKILL.md
@@ -1 +1,5 @@
+---
+dependencies:
+  dep-skill: "${dependencySpecifier}"
+---
 # Root
`,
    )

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'root-skill': `file:${tarballPath}#path:/skills/root-skill`,
      },
      patchedSkills: {
        'root-skill': 'patches/root-skill.patch',
      },
    })

    await installCommand({ cwd: root })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(manifest.dependencies).toEqual({
      'dep-skill': dependencySpecifier,
    })
    expect(readFileSync(path.join(root, '.agents/skills/root-skill/SKILL.md'), 'utf8')).toContain(
      'dependencies:',
    )
    expect(existsSync(path.join(root, '.agents/skills/dep-skill/SKILL.md'))).toBe(true)
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

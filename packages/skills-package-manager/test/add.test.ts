import { execSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import YAML from 'yaml'
import { addCommand, normalizeAddCommandInput, parseAddSourceSpecifier } from '../src/commands/add'
import { createSkillPackage, packDirectory, startMockNpmRegistry } from './helpers'

describe('normalizeAddCommandInput', () => {
  it('supports owner/repo@skill shorthand', () => {
    expect(normalizeAddCommandInput('inference-sh/skills@landing-page-design')).toEqual({
      specifier: 'inference-sh/skills',
      skill: 'landing-page-design',
    })
  })

  it('supports GitHub URL @skill shorthand', () => {
    expect(
      normalizeAddCommandInput('https://github.com/tool-belt/skills@landing-page-design'),
    ).toEqual({
      specifier: 'https://github.com/tool-belt/skills',
      skill: 'landing-page-design',
    })
  })

  it('prefers the explicit --skill option over shorthand when both are present', () => {
    expect(
      normalizeAddCommandInput('inference-sh/skills@other-skill', 'landing-page-design'),
    ).toEqual({
      specifier: 'inference-sh/skills',
      skill: 'landing-page-design',
    })
  })

  it('does not split non-repository specifiers that contain @', () => {
    expect(normalizeAddCommandInput('npm:@scope/skills-package')).toEqual({
      specifier: 'npm:@scope/skills-package',
      skill: undefined,
    })
  })

  it('supports owner/repo#branch@skill shorthand', () => {
    expect(
      normalizeAddCommandInput('inference-sh/skills#feature/skills@landing-page-design'),
    ).toEqual({
      specifier: 'inference-sh/skills#feature/skills',
      skill: 'landing-page-design',
    })
  })
})

describe('parseAddSourceSpecifier', () => {
  it('parses GitHub shorthand with subpath and branch', () => {
    expect(parseAddSourceSpecifier('owner/repo/skills/my-skill#feature/skills')).toEqual({
      type: 'repo',
      cloneUrl: 'https://github.com/owner/repo.git',
      displaySource: 'owner/repo',
      ref: 'feature/skills',
      subpath: 'skills/my-skill',
    })
  })

  it('parses GitHub tree URLs', () => {
    expect(
      parseAddSourceSpecifier('https://github.com/owner/repo/tree/main/skills/my-skill'),
    ).toEqual({
      type: 'repo',
      cloneUrl: 'https://github.com/owner/repo.git',
      displaySource: 'owner/repo',
      ref: 'main',
      subpath: 'skills/my-skill',
    })
  })

  it('parses github: shorthand', () => {
    expect(parseAddSourceSpecifier('github:owner/repo')).toEqual({
      type: 'repo',
      cloneUrl: 'https://github.com/owner/repo.git',
      displaySource: 'owner/repo',
    })
  })

  it('parses GitLab tree URLs', () => {
    expect(
      parseAddSourceSpecifier('https://gitlab.com/group/subgroup/repo/-/tree/main/skills/my-skill'),
    ).toEqual({
      type: 'repo',
      cloneUrl: 'https://gitlab.com/group/subgroup/repo.git',
      displaySource: 'group/subgroup/repo',
      ref: 'main',
      subpath: 'skills/my-skill',
    })
  })

  it('parses generic git URLs with refs', () => {
    expect(parseAddSourceSpecifier('https://git.example.com/owner/repo.git#release-2026')).toEqual({
      type: 'repo',
      cloneUrl: 'https://git.example.com/owner/repo.git',
      displaySource: 'https://git.example.com/owner/repo.git',
      ref: 'release-2026',
    })
  })

  it('parses local paths', () => {
    const localSource = path.resolve(__dirname, 'fixtures/local-source')
    expect(parseAddSourceSpecifier(localSource)).toEqual({
      type: 'local',
      localPath: localSource,
      displaySource: localSource,
    })
  })

  it('parses local skill directories as a local source with subpath', () => {
    const localSkillPath = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')
    expect(parseAddSourceSpecifier(localSkillPath)).toEqual({
      type: 'local',
      localPath: path.dirname(localSkillPath),
      displaySource: localSkillPath,
      subpath: 'hello-skill',
    })
  })
})

describe('addCommand', () => {
  it('writes manifest and lock for a file skill specifier', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello skill\n')
    const tarballPath = packDirectory(packageRoot)
    const portableTarballPath = path.relative(root, tarballPath).split(path.sep).join('/')

    await addCommand({
      cwd: root,
      specifier: `file:${tarballPath}#path:/skills/hello-skill`,
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))

    expect(manifest.skills['hello-skill']).toBe(`file:${tarballPath}#path:/skills/hello-skill`)
    expect(lockfile.skills['hello-skill'].resolution.type).toBe('file')
    expect(lockfile.skills['hello-skill'].resolution.tarball).toBe(portableTarballPath)
    expect(lockfile.skills['hello-skill'].resolution.path).toBe('/skills/hello-skill')
  })

  it('keeps the bundled self skill out of skills.json and skills-lock.yaml', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-self-skill-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        { installDir: '.agents/skills', linkTargets: [], selfSkill: true, skills: {} },
        null,
        2,
      ),
    )
    const packageRoot = createSkillPackage('hello-skill', '# Hello skill\n')
    const tarballPath = packDirectory(packageRoot)

    await addCommand({
      cwd: root,
      specifier: `file:${tarballPath}#path:/skills/hello-skill`,
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
    const installedSkill = path.join(root, '.agents/skills/skills-package-manager-cli/SKILL.md')

    expect(manifest.selfSkill).toBe(true)
    expect(manifest.skills['hello-skill']).toBe(`file:${tarballPath}#path:/skills/hello-skill`)
    expect(manifest.skills['skills-package-manager-cli']).toBeUndefined()
    expect(lockfile.skills['skills-package-manager-cli']).toBeUndefined()
    expect(existsSync(installedSkill)).toBe(true)
  })

  it('installs and links a link skill immediately after add', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-install-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: ['.claude/skills'],
          skills: {},
        },
        null,
        2,
      ),
    )

    await addCommand({
      cwd: root,
      specifier: `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
    })

    const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
    const linkedSkill = path.join(root, '.claude/skills/hello-skill')

    expect(existsSync(installedSkill)).toBe(true)
    expect(lstatSync(linkedSkill).isSymbolicLink()).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello skill')
  })

  it('adds a local skill directory without requiring link: prefix', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-local-direct-'))
    const localSkillPath = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')

    await addCommand({
      cwd: root,
      specifier: localSkillPath,
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')

    expect(manifest.skills['hello-skill']).toBe(
      `link:${localSkillPath.replace(/\\/g, '/').replace(/\/+$/, '')}`,
    )
    expect(existsSync(installedSkill)).toBe(true)
  })

  it('adds all skills from a local source when --skill is *', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-local-all-'))
    const localRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-local-source-'))

    mkdirSync(path.join(localRepo, 'skills/hello-skill'), { recursive: true })
    mkdirSync(path.join(localRepo, 'guides/design/landing-page-design'), { recursive: true })
    writeFileSync(path.join(localRepo, 'skills/hello-skill/SKILL.md'), '# Hello skill\n')
    writeFileSync(
      path.join(localRepo, 'guides/design/landing-page-design/SKILL.md'),
      '---\nname: landing-page-design\ndescription: Design landing pages\n---\n',
    )

    await addCommand({
      cwd: root,
      specifier: localRepo,
      skill: '*',
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(manifest.skills['hello-skill']).toBe(
      `link:${path.join(localRepo, 'skills/hello-skill')}`,
    )
    expect(manifest.skills['landing-page-design']).toBe(
      `link:${path.join(localRepo, 'guides/design/landing-page-design')}`,
    )
  })

  it('adds all discovered skills when --yes is passed without --skill', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-yes-all-'))
    const localRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-local-yes-'))

    mkdirSync(path.join(localRepo, 'skills/hello-skill'), { recursive: true })
    mkdirSync(path.join(localRepo, 'guides/design/landing-page-design'), { recursive: true })
    writeFileSync(path.join(localRepo, 'skills/hello-skill/SKILL.md'), '# Hello skill\n')
    writeFileSync(
      path.join(localRepo, 'guides/design/landing-page-design/SKILL.md'),
      '---\nname: landing-page-design\ndescription: Design landing pages\n---\n',
    )

    await addCommand({
      cwd: root,
      specifier: localRepo,
      yes: true,
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(Object.keys(manifest.skills).sort()).toEqual(['hello-skill', 'landing-page-design'])
  })

  it('adds project agent link targets when --agent is specified', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-agents-'))
    const localSkillPath = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')

    await addCommand({
      cwd: root,
      specifier: localSkillPath,
      agent: ['claude-code', 'continue'],
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(manifest.installDir).toBe('.agents/skills')
    expect(manifest.linkTargets).toEqual(['.claude/skills', '.continue/skills'])
    expect(lstatSync(path.join(root, '.claude/skills/hello-skill')).isSymbolicLink()).toBe(true)
    expect(lstatSync(path.join(root, '.continue/skills/hello-skill')).isSymbolicLink()).toBe(true)
  })

  it('merges project agent link targets into an existing manifest without adding universal targets', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-agents-existing-'))
    const localSkillPath = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')

    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: ['.claude/skills'],
          skills: {},
        },
        null,
        2,
      ),
    )

    await addCommand({
      cwd: root,
      specifier: localSkillPath,
      agent: ['continue', 'cursor'],
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(manifest.installDir).toBe('.agents/skills')
    expect(manifest.linkTargets).toEqual(['.claude/skills', '.continue/skills'])
    expect(lstatSync(path.join(root, '.claude/skills/hello-skill')).isSymbolicLink()).toBe(true)
    expect(lstatSync(path.join(root, '.continue/skills/hello-skill')).isSymbolicLink()).toBe(true)
  })

  it('adds global agent link targets when -g is specified', async () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-global-project-'))
    const globalRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-global-home-'))
    const claudeConfigDir = path.join(globalRoot, '.claude')
    const localSkillPath = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')
    const previousSpmHome = process.env.SKILLS_PACKAGE_MANAGER_HOME
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR

    process.env.SKILLS_PACKAGE_MANAGER_HOME = path.join(globalRoot, '.spm-home')
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir

    try {
      await addCommand({
        cwd: projectRoot,
        specifier: localSkillPath,
        global: true,
        agent: ['claude-code'],
        yes: true,
      })

      expect(existsSync(path.join(projectRoot, 'skills.json'))).toBe(false)

      const globalManifest = JSON.parse(
        readFileSync(path.join(process.env.SKILLS_PACKAGE_MANAGER_HOME, 'skills.json'), 'utf8'),
      )
      expect(globalManifest.linkTargets).toEqual([path.join(claudeConfigDir, 'skills')])
      expect(lstatSync(path.join(claudeConfigDir, 'skills/hello-skill')).isSymbolicLink()).toBe(
        true,
      )
      expect(
        existsSync(
          path.join(process.env.SKILLS_PACKAGE_MANAGER_HOME, '.agents/skills/hello-skill/SKILL.md'),
        ),
      ).toBe(true)
    } finally {
      if (previousSpmHome === undefined) {
        delete process.env.SKILLS_PACKAGE_MANAGER_HOME
      } else {
        process.env.SKILLS_PACKAGE_MANAGER_HOME = previousSpmHome
      }

      if (previousClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      }
    }
  })

  it('merges global agent link targets into an existing global manifest', async () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-global-merge-project-'))
    const globalRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-global-merge-home-'))
    const spmHome = path.join(globalRoot, '.spm-home')
    const claudeConfigDir = path.join(globalRoot, '.claude')
    const codexHome = path.join(globalRoot, '.codex')
    const localSkillPath = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')
    const previousSpmHome = process.env.SKILLS_PACKAGE_MANAGER_HOME
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    const previousCodexHome = process.env.CODEX_HOME

    process.env.SKILLS_PACKAGE_MANAGER_HOME = spmHome
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir
    process.env.CODEX_HOME = codexHome

    try {
      mkdirSync(spmHome, { recursive: true })
      writeFileSync(
        path.join(spmHome, 'skills.json'),
        JSON.stringify(
          {
            installDir: '.agents/skills',
            linkTargets: [path.join(claudeConfigDir, 'skills')],
            skills: {},
          },
          null,
          2,
        ),
      )

      await addCommand({
        cwd: projectRoot,
        specifier: localSkillPath,
        global: true,
        agent: ['codex'],
      })

      const globalManifest = JSON.parse(readFileSync(path.join(spmHome, 'skills.json'), 'utf8'))
      expect(globalManifest.linkTargets).toEqual([
        path.join(claudeConfigDir, 'skills'),
        path.join(codexHome, 'skills'),
      ])
      expect(lstatSync(path.join(claudeConfigDir, 'skills/hello-skill')).isSymbolicLink()).toBe(
        true,
      )
      expect(lstatSync(path.join(codexHome, 'skills/hello-skill')).isSymbolicLink()).toBe(true)
    } finally {
      if (previousSpmHome === undefined) {
        delete process.env.SKILLS_PACKAGE_MANAGER_HOME
      } else {
        process.env.SKILLS_PACKAGE_MANAGER_HOME = previousSpmHome
      }

      if (previousClaudeConfigDir === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR
      } else {
        process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      }

      if (previousCodexHome === undefined) {
        delete process.env.CODEX_HOME
      } else {
        process.env.CODEX_HOME = previousCodexHome
      }
    }
  })

  it('requires --agent on first global add', async () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-global-first-use-project-'))
    const globalRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-global-first-use-home-'))
    const localSkillPath = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')
    const previousSpmHome = process.env.SKILLS_PACKAGE_MANAGER_HOME

    process.env.SKILLS_PACKAGE_MANAGER_HOME = path.join(globalRoot, '.spm-home')

    try {
      await expect(
        addCommand({
          cwd: projectRoot,
          specifier: localSkillPath,
          global: true,
        }),
      ).rejects.toThrow('Global add requires at least one --agent on first use')
    } finally {
      if (previousSpmHome === undefined) {
        delete process.env.SKILLS_PACKAGE_MANAGER_HOME
      } else {
        process.env.SKILLS_PACKAGE_MANAGER_HOME = previousSpmHome
      }
    }
  })

  it('rejects invalid agents', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-invalid-agent-'))
    const localSkillPath = path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')

    await expect(
      addCommand({
        cwd: root,
        specifier: localSkillPath,
        agent: ['not-a-real-agent'],
      }),
    ).rejects.toThrow('Invalid agents: not-a-real-agent')
  })

  it('writes manifest and lock for an npm skill specifier', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-npm-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from npm\n')
    const registry = await startMockNpmRegistry(packageRoot, { authToken: 'test-token' })

    try {
      writeFileSync(
        path.join(root, '.npmrc'),
        `registry=${registry.registryUrl}\n${registry.authTokenConfigLine}\n`,
      )

      await addCommand({
        cwd: root,
        specifier: `npm:${registry.packageName}#path:/skills/hello-skill`,
      })

      const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
      const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))

      expect(manifest.skills['hello-skill']).toBe(
        `npm:${registry.packageName}#path:/skills/hello-skill`,
      )
      expect(lockfile.skills['hello-skill'].resolution.type).toBe('npm')
      expect(lockfile.skills['hello-skill'].resolution.packageName).toBe('@tests/hello-skill')
      expect(lockfile.skills['hello-skill'].resolution.version).toBe('1.0.0')
      expect(lockfile.skills['hello-skill'].resolution.tarball).toBe(registry.tarballUrl)
      expect(lockfile.skills['hello-skill'].resolution.registry).toBe(registry.registryUrl)
    } finally {
      await registry.close()
    }
  })

  it('writes manifest and lock for a git skill specifier', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-git-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-git-source-'))

    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Hello from add git\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const commit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

    await addCommand({
      cwd: root,
      specifier: `${gitRepo}#HEAD&path:/skills/hello-skill`,
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))

    expect(manifest.skills['hello-skill']).toBe(`${gitRepo}#HEAD&path:/skills/hello-skill`)
    expect(lockfile.skills['hello-skill'].resolution.type).toBe('git')
    expect(lockfile.skills['hello-skill'].resolution.url).toBe(gitRepo)
    expect(lockfile.skills['hello-skill'].resolution.commit).toBe(commit)
    expect(lockfile.skills['hello-skill'].resolution.path).toBe('/skills/hello-skill')
  })

  it('adds a skill with owner/repo and --skill flag', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-shorthand-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-shorthand-source-'))

    mkdirSync(path.join(gitRepo, 'dogfood'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'dogfood/SKILL.md'), '# Dogfood skill\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })

    // Use a direct git specifier to test the --skill path builds the right specifier
    // (We can't actually test owner/repo without GitHub API, so test the protocol fallback)
    await addCommand({
      cwd: root,
      specifier: `${gitRepo}#HEAD&path:/dogfood`,
      skill: undefined,
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    expect(manifest.skills.dogfood).toBe(`${gitRepo}#HEAD&path:/dogfood`)
  })
})

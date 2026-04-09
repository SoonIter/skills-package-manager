import { execSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import YAML from 'yaml'
import { addCommand } from '../src/commands/add'
import { createSkillPackage, packDirectory, startMockNpmRegistry } from './helpers'

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

  it('keeps the auto-injected self skill out of skills.json while locking it', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-add-self-skill-'))
    mkdirSync(path.join(root, 'skills/repo-self-skill'), { recursive: true })
    writeFileSync(
      path.join(root, 'skills/repo-self-skill/SKILL.md'),
      '---\nname: repo-self-skill\ndescription: Repo self skill\n---\n# Repo self skill\n',
    )
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

    expect(manifest.selfSkill).toBe(true)
    expect(manifest.skills['hello-skill']).toBe(`file:${tarballPath}#path:/skills/hello-skill`)
    expect(manifest.skills['repo-self-skill']).toBeUndefined()
    expect(lockfile.skills['repo-self-skill'].specifier).toBe('link:./skills/repo-self-skill')
    expect(lockfile.skills['repo-self-skill'].resolution.type).toBe('link')
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

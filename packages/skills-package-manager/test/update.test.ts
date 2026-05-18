import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { updateCommand } from '../src/commands/update'
import { resolveSkillEntry } from '../src/config/resolveSkillsPlan'
import { createSkillPackage, packDirectory, startMockNpmRegistry } from './helpers'

function createMainBranchGitSkillRepo() {
  const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-git-source-'))
  mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
  writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# First version\n')
  execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git checkout -b main', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
  const firstCommit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

  writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Second version\n')
  execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git commit -m update', { cwd: gitRepo, stdio: 'ignore' })
  const secondCommit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

  return { gitRepo, firstCommit, secondCommit }
}

async function startTwoVersionRegistry() {
  const packageV1 = createSkillPackage('hello-skill', '# Hello from npm v1\n', '1.0.0')
  const packageV2 = createSkillPackage('hello-skill', '# Hello from npm v2\n', '2.0.0')
  const tarballV1 = packDirectory(packageV1)
  const tarballV2 = packDirectory(packageV2)
  const tarballV1Buffer = readFileSync(tarballV1)
  const tarballV2Buffer = readFileSync(tarballV2)
  const packageName = '@tests/hello-skill'
  let port = 0

  const server = createServer((req, res) => {
    const requestPath = req.url?.split('?')[0] ?? '/'
    if (decodeURIComponent(requestPath.slice(1)) === packageName) {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          'dist-tags': { latest: '2.0.0' },
          versions: {
            '1.0.0': {
              name: packageName,
              version: '1.0.0',
              dist: { tarball: `http://127.0.0.1:${port}/tarballs/v1.tgz` },
            },
            '2.0.0': {
              name: packageName,
              version: '2.0.0',
              dist: { tarball: `http://127.0.0.1:${port}/tarballs/v2.tgz` },
            },
          },
        }),
      )
      return
    }

    if (requestPath === '/tarballs/v1.tgz') {
      res.setHeader('content-type', 'application/octet-stream')
      res.end(tarballV1Buffer)
      return
    }

    if (requestPath === '/tarballs/v2.tgz') {
      res.setHeader('content-type', 'application/octet-stream')
      res.end(tarballV2Buffer)
      return
    }

    res.statusCode = 404
    res.end('not found')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start test registry')
  }
  port = address.port

  return {
    packageName,
    registryUrl: `http://127.0.0.1:${port}/`,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    },
  }
}

describe('resolveSkillEntry', () => {
  it('uses empty digest for link resolutions', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-link-'))
    const skillDir = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-link-source-'))

    writeFileSync(path.join(skillDir, 'SKILL.md'), '# Hello skill\n')
    const first = await resolveSkillEntry(root, `link:${skillDir}`)

    writeFileSync(path.join(skillDir, 'SKILL.md'), '# Updated skill\n')
    const second = await resolveSkillEntry(root, `link:${skillDir}`)

    expect(first.entry.resolution.type).toBe('link')
    expect(second.entry.resolution.type).toBe('link')
    expect(first.entry.digest).toBe('')
    expect(second.entry.digest).toBe('')
  })

  it('resolves git specifiers to the current commit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-resolve-git-'))
    const { gitRepo, secondCommit } = createMainBranchGitSkillRepo()

    const { skillName, entry } = await resolveSkillEntry(
      root,
      `${gitRepo}#main&path:/skills/hello-skill`,
    )

    expect(skillName).toBe('hello-skill')
    expect(entry.resolution.type).toBe('git')
    if (entry.resolution.type !== 'git') {
      throw new Error('Expected git resolution')
    }
    expect(entry.resolution.commit).toBe(secondCommit)
    expect(entry.resolution.path).toBe('/skills/hello-skill')
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

      const { entry } = await resolveSkillEntry(
        root,
        'npm:@tests/hello-skill&path:/skills/hello-skill',
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

describe('updateCommand', () => {
  it('updates git skills to the latest main commit in skills.json and installs them', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-git-'))
    const { gitRepo, firstCommit, secondCommit } = createMainBranchGitSkillRepo()

    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'hello-skill': `${gitRepo}#${firstCommit}&path:/skills/hello-skill`,
          },
        },
        null,
        2,
      ),
    )

    const result = await updateCommand({ cwd: root, skills: ['hello-skill'] })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(result.status).toBe('updated')
    expect(result.updated).toEqual(['hello-skill'])
    expect(manifest.skills['hello-skill']).toBe(
      `${gitRepo}#${secondCommit}&path:/skills/hello-skill`,
    )
    expect(readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')).toContain(
      'Second version',
    )
    expect(existsSync(path.join(root, 'skills-lock.yaml'))).toBe(false)
  })

  it('updates npm skills to the latest version in skills.json and installs them', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-npm-'))
    const registry = await startTwoVersionRegistry()

    try {
      writeFileSync(path.join(root, '.npmrc'), `registry=${registry.registryUrl}\n`)
      writeFileSync(
        path.join(root, 'skills.json'),
        JSON.stringify(
          {
            installDir: '.agents/skills',
            linkTargets: [],
            skills: {
              'hello-skill': `npm:${registry.packageName}@1.0.0&path:/skills/hello-skill`,
            },
          },
          null,
          2,
        ),
      )

      const result = await updateCommand({ cwd: root })
      const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

      expect(result.status).toBe('updated')
      expect(manifest.skills['hello-skill']).toBe(
        `npm:${registry.packageName}@2.0.0&path:/skills/hello-skill`,
      )
      expect(
        readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8'),
      ).toContain('Hello from npm v2')
      expect(existsSync(path.join(root, 'skills-lock.yaml'))).toBe(false)
    } finally {
      await registry.close()
    }
  })

  it('skips link, local, and file specifiers but still installs the full manifest', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-skip-'))
    const localSkill = path.join(root, '.agents/skills/local-skill')
    const packageRoot = createSkillPackage('file-skill', '# File skill\n')
    const tarballPath = packDirectory(packageRoot)

    mkdirSync(localSkill, { recursive: true })
    writeFileSync(path.join(localSkill, 'SKILL.md'), '# Local skill\n')
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'link-skill': `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
            'local-skill': 'local:*',
            'file-skill': `file:${tarballPath}#path:/skills/file-skill`,
          },
        },
        null,
        2,
      ),
    )

    const result = await updateCommand({ cwd: root })

    expect(result.status).toBe('skipped')
    expect(result.skipped).toEqual([
      { name: 'link-skill', reason: 'link-specifier' },
      { name: 'local-skill', reason: 'local-specifier' },
      { name: 'file-skill', reason: 'file-specifier' },
    ])
    expect(existsSync(path.join(root, '.agents/skills/link-skill/SKILL.md'))).toBe(true)
    expect(existsSync(path.join(root, '.agents/skills/file-skill/SKILL.md'))).toBe(true)
  })

  it('throws for unknown target skills', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-unknown-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            existing: `link:${path.resolve(__dirname, 'fixtures/local-source/skills/hello-skill')}`,
          },
        },
        null,
        2,
      ),
    )

    await expect(updateCommand({ cwd: root, skills: ['missing'] })).rejects.toThrow(
      'Unknown skill: missing',
    )
  })

  it('returns failed and keeps skills.json unchanged when a target cannot resolve', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-failed-'))
    const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-failed-source-'))
    mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Hello\n')
    execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git checkout -b dev', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
    execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
    const initialManifest = {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `${gitRepo}#old&path:/skills/hello-skill`,
      },
    }
    writeFileSync(path.join(root, 'skills.json'), JSON.stringify(initialManifest, null, 2))

    const result = await updateCommand({ cwd: root })
    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))

    expect(result.status).toBe('failed')
    expect(result.failed[0].name).toBe('hello-skill')
    expect(manifest).toEqual(initialManifest)
  })
})

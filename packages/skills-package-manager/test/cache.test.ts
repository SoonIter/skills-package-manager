import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { resolveLockEntry } from '../src/config/syncSkillsLock'
import type { SkillsManifest } from '../src/config/types'
import { writeSkillsLock } from '../src/config/writeSkillsLock'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { cloneAndDiscover } from '../src/github/listSkills'
import { installSkills } from '../src/install/installSkills'
import { createSkillPackage, startMockNpmRegistry } from './helpers'

async function withCacheDir<T>(
  prefix: string,
  callback: (cacheDir: string) => Promise<T>,
): Promise<T> {
  const previousCacheDir = process.env.SPM_CACHE_DIR
  const cacheDir = mkdtempSync(path.join(tmpdir(), prefix))
  process.env.SPM_CACHE_DIR = cacheDir

  try {
    return await callback(cacheDir)
  } finally {
    if (previousCacheDir === undefined) {
      delete process.env.SPM_CACHE_DIR
    } else {
      process.env.SPM_CACHE_DIR = previousCacheDir
    }
  }
}

function createGitRemote(skillName: string, content: string) {
  const sourceRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-git-source-'))
  const remoteRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-git-remote-'))
  const skillDir = path.join(sourceRepo, 'skills', skillName)

  mkdirSync(skillDir, { recursive: true })
  writeFileSync(path.join(skillDir, 'SKILL.md'), content)
  execSync('git init', { cwd: sourceRepo, stdio: 'ignore' })
  execSync('git config user.email test@example.com', { cwd: sourceRepo, stdio: 'ignore' })
  execSync('git config user.name test', { cwd: sourceRepo, stdio: 'ignore' })
  execSync('git add .', { cwd: sourceRepo, stdio: 'ignore' })
  execSync('git commit -m init', { cwd: sourceRepo, stdio: 'ignore' })
  execSync(`git clone --bare ${JSON.stringify(sourceRepo)} ${JSON.stringify(remoteRepo)}`, {
    stdio: 'ignore',
  })

  return {
    sourceRepo,
    remoteRepo,
    remoteUrl: `file://${remoteRepo}`,
    commit: execSync('git rev-parse HEAD', { cwd: sourceRepo }).toString().trim(),
  }
}

function createNpmManifest(packageName: string): SkillsManifest {
  return {
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {
      'hello-skill': `npm:${packageName}#path:/skills/hello-skill`,
    },
  }
}

async function writeFrozenNpmProject(
  rootDir: string,
  packageName: string,
  version: string,
  tarballUrl: string,
  integrity: string,
  registryUrl: string,
) {
  await writeSkillsManifest(rootDir, createNpmManifest(packageName))
  await writeSkillsLock(rootDir, {
    lockfileVersion: '0.1',
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {
      'hello-skill': {
        specifier: `npm:${packageName}#path:/skills/hello-skill`,
        resolution: {
          type: 'npm',
          packageName,
          version,
          path: '/skills/hello-skill',
          tarball: tarballUrl,
          integrity,
          registry: registryUrl,
        },
        digest: 'test-cache-digest',
      },
    },
  })
}

describe('global cache', () => {
  it('reuses cached git mirrors across discovery runs', async () => {
    await withCacheDir('skills-pm-cache-mirror-', async (cacheDir) => {
      const remote = createGitRemote('hello-skill', '# Hello from git cache\n')

      const first = await cloneAndDiscover(remote.remoteUrl)
      expect(first.skills).toHaveLength(1)

      const repoDirs = readdirSync(path.join(cacheDir, 'repos'))
      expect(repoDirs).toHaveLength(1)
      const mirrorDir = path.join(cacheDir, 'repos', repoDirs[0], 'mirror.git')
      const markerPath = path.join(mirrorDir, 'codex-marker')
      writeFileSync(markerPath, 'kept\n')
      await first.cleanup()

      const second = await cloneAndDiscover(remote.remoteUrl)
      expect(second.skills[0]?.name).toBe('hello-skill')
      expect(readFileSync(markerPath, 'utf8')).toBe('kept\n')
      await second.cleanup()
    })
  })

  it('reuses cached pinned git commits when the remote disappears', async () => {
    await withCacheDir('skills-pm-cache-offline-', async () => {
      const remote = createGitRemote('hello-git-skill', '# First version\n')
      const firstRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-install-a-'))
      const secondRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-install-b-'))
      const manifest: SkillsManifest = {
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-git-skill': `${remote.remoteUrl}#${remote.commit}&path:/skills/hello-git-skill`,
        },
      }

      await writeSkillsManifest(firstRoot, manifest)
      await writeSkillsLock(firstRoot, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-git-skill': {
            specifier: `${remote.remoteUrl}#${remote.commit}&path:/skills/hello-git-skill`,
            resolution: {
              type: 'git',
              url: remote.remoteUrl,
              commit: remote.commit,
              path: '/skills/hello-git-skill',
            },
            digest: 'test-git-cache-digest',
          },
        },
      })

      await installSkills(firstRoot, { frozenLockfile: true })
      rmSync(remote.remoteRepo, { recursive: true, force: true })

      await writeSkillsManifest(secondRoot, manifest)
      await writeSkillsLock(secondRoot, {
        lockfileVersion: '0.1',
        installDir: '.agents/skills',
        linkTargets: [],
        skills: {
          'hello-git-skill': {
            specifier: `${remote.remoteUrl}#${remote.commit}&path:/skills/hello-git-skill`,
            resolution: {
              type: 'git',
              url: remote.remoteUrl,
              commit: remote.commit,
              path: '/skills/hello-git-skill',
            },
            digest: 'test-git-cache-digest',
          },
        },
      })

      await installSkills(secondRoot, { frozenLockfile: true })
      expect(
        readFileSync(path.join(secondRoot, '.agents/skills/hello-git-skill/SKILL.md'), 'utf8'),
      ).toContain('First version')
    })
  })

  it('revalidates cached npm metadata with ETag responses', async () => {
    await withCacheDir('skills-pm-cache-metadata-', async (cacheDir) => {
      const rootA = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-metadata-a-'))
      const rootB = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-metadata-b-'))
      const packageRoot = createSkillPackage('hello-skill', '# Hello cache metadata\n')
      const registry = await startMockNpmRegistry(packageRoot, { etag: '"v1"' })

      try {
        writeFileSync(path.join(rootA, '.npmrc'), `registry=${registry.registryUrl}\n`)
        writeFileSync(path.join(rootB, '.npmrc'), `registry=${registry.registryUrl}\n`)

        const first = await resolveLockEntry(
          rootA,
          `npm:${registry.packageName}#path:/skills/hello-skill`,
        )
        const second = await resolveLockEntry(
          rootB,
          `npm:${registry.packageName}#path:/skills/hello-skill`,
        )
        const counts = registry.getRequestCounts()

        expect(first.entry.resolution.type).toBe('npm')
        expect(second.entry.resolution.type).toBe('npm')
        expect(counts.metadata200Responses).toBe(1)
        expect(counts.metadata304Responses).toBe(1)
        expect(readdirSync(path.join(cacheDir, 'npm-metadata')).length).toBe(1)
      } finally {
        await registry.close()
      }
    })
  })

  it('reuses cached npm tarballs and redownloads corrupted cache entries', async () => {
    await withCacheDir('skills-pm-cache-tarball-', async (cacheDir) => {
      const rootA = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-tarball-a-'))
      const rootB = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-tarball-b-'))
      const rootC = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-tarball-c-'))
      const packageRoot = createSkillPackage('hello-skill', '# Hello tarball cache\n')
      const registry = await startMockNpmRegistry(packageRoot)

      try {
        for (const root of [rootA, rootB, rootC]) {
          writeFileSync(path.join(root, '.npmrc'), `registry=${registry.registryUrl}\n`)
          await writeFrozenNpmProject(
            root,
            registry.packageName,
            registry.version,
            registry.tarballUrl,
            registry.integrity,
            registry.registryUrl,
          )
        }

        await installSkills(rootA, { frozenLockfile: true })
        await installSkills(rootB, { frozenLockfile: true })
        expect(registry.getRequestCounts().tarballRequests).toBe(1)

        const tarballDir = path.join(cacheDir, 'tarballs')
        const cachedTarballs = readdirSync(tarballDir)
        expect(cachedTarballs).toHaveLength(1)
        writeFileSync(path.join(tarballDir, cachedTarballs[0]), 'corrupted-tarball')

        await installSkills(rootC, { frozenLockfile: true })
        expect(registry.getRequestCounts().tarballRequests).toBe(2)
        expect(
          readFileSync(path.join(rootC, '.agents/skills/hello-skill/SKILL.md'), 'utf8'),
        ).toContain('Hello tarball cache')
      } finally {
        await registry.close()
      }
    })
  })

  it('stores cache artifacts under SPM_CACHE_DIR', async () => {
    await withCacheDir('skills-pm-cache-env-', async (cacheDir) => {
      const remote = createGitRemote('hello-skill', '# Cache root\n')
      const npmRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-cache-env-root-'))
      const packageRoot = createSkillPackage('hello-skill', '# Cache env\n')
      const registry = await startMockNpmRegistry(packageRoot)

      try {
        const discovery = await cloneAndDiscover(remote.remoteUrl)
        await discovery.cleanup()

        writeFileSync(path.join(npmRoot, '.npmrc'), `registry=${registry.registryUrl}\n`)
        await resolveLockEntry(npmRoot, `npm:${registry.packageName}#path:/skills/hello-skill`)

        expect(existsSync(path.join(cacheDir, 'repos'))).toBe(true)
        expect(existsSync(path.join(cacheDir, 'npm-metadata'))).toBe(true)
        expect(readdirSync(path.join(cacheDir, 'repos')).length).toBe(1)
        expect(readdirSync(path.join(cacheDir, 'npm-metadata')).length).toBe(1)
      } finally {
        await registry.close()
      }
    })
  })
})

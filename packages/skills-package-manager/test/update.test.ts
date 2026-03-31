import { describe, expect, it } from '@rstest/core'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import YAML from 'yaml'
import { resolveLockEntry } from '../src/config/syncSkillsLock'
import { fetchSkillsFromLock, linkSkillsFromLock } from '../src/install/installSkills'
import type { SkillsLock, SkillsManifest } from '../src/config/types'

describe('resolveLockEntry', () => {
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

    const { skillName, entry } = await resolveLockEntry(root, `${gitRepo}#HEAD&path:/skills/hello-skill`)

    expect(skillName).toBe('hello-skill')
    expect(entry.resolution.type).toBe('git')
    expect(entry.resolution.commit).toBe(commit)
    expect(entry.resolution.path).toBe('/skills/hello-skill')
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
      linkTargets: ['.cursor/skills'],
      skills: {
        'hello-skill': `file:${sourceRoot}#path:/skills/hello-skill`,
      },
    }

    const lockfile: SkillsLock = {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: ['.cursor/skills'],
      skills: {
        'hello-skill': {
          specifier: `file:${sourceRoot}#path:/skills/hello-skill`,
          resolution: { type: 'file', path: sourceRoot },
          digest: 'sha256-test',
        },
      },
    }

    await fetchSkillsFromLock(root, manifest, lockfile)
    await linkSkillsFromLock(root, manifest, lockfile)

    const installed = readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')
    expect(installed).toContain('Hello stage')
    expect(existsSync(path.join(root, '.cursor/skills/hello-skill'))).toBe(true)
  })
})

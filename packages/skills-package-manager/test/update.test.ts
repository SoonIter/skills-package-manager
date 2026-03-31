import { describe, expect, it } from '@rstest/core'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
import YAML from 'yaml'
import { resolveLockEntry } from '../src/config/syncSkillsLock'

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

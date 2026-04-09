import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import {
  discoverSelfSkillsInDir,
  discoverSkillsInDir,
  parseGitHubUrl,
  parseOwnerRepo,
} from '../src/github/listSkills'

describe('parseOwnerRepo', () => {
  it('parses owner/repo format', () => {
    expect(parseOwnerRepo('mxyhi/ok-skills')).toEqual({
      owner: 'mxyhi',
      repo: 'ok-skills',
    })
  })

  it('parses owner/repo with dots and hyphens', () => {
    expect(parseOwnerRepo('some.user/my-repo.git')).toEqual({
      owner: 'some.user',
      repo: 'my-repo.git',
    })
  })

  it('returns null for protocol specifiers', () => {
    expect(parseOwnerRepo('file:./local-source')).toBeNull()
    expect(parseOwnerRepo('link:./local-source')).toBeNull()
    expect(parseOwnerRepo('npm:@scope/pkg')).toBeNull()
    expect(parseOwnerRepo('https://github.com/owner/repo.git')).toBeNull()
  })

  it('returns null for bare names without slash', () => {
    expect(parseOwnerRepo('some-skill')).toBeNull()
  })

  it('returns null for paths with multiple slashes', () => {
    expect(parseOwnerRepo('a/b/c')).toBeNull()
  })
})

describe('parseGitHubUrl', () => {
  it('parses https://github.com/owner/repo', () => {
    expect(parseGitHubUrl('https://github.com/vercel-labs/skills')).toEqual({
      owner: 'vercel-labs',
      repo: 'skills',
    })
  })

  it('parses https://github.com/owner/repo.git', () => {
    expect(parseGitHubUrl('https://github.com/mxyhi/ok-skills.git')).toEqual({
      owner: 'mxyhi',
      repo: 'ok-skills',
    })
  })

  it('parses with trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/')).toEqual({
      owner: 'owner',
      repo: 'repo',
    })
  })

  it('returns null for non-GitHub URLs', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull()
  })

  it('returns null for GitHub URLs with path fragments', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/tree/main')).toBeNull()
  })

  it('returns null for owner/repo shorthand', () => {
    expect(parseGitHubUrl('owner/repo')).toBeNull()
  })
})

describe('discoverSkillsInDir', () => {
  it('discovers skills at root level', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skills-discover-root-'))
    mkdirSync(path.join(dir, 'my-skill'), { recursive: true })
    writeFileSync(
      path.join(dir, 'my-skill/SKILL.md'),
      '---\nname: my-skill\ndescription: A test skill\n---\n# My Skill\n',
    )

    const skills = await discoverSkillsInDir(dir)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('my-skill')
    expect(skills[0].description).toBe('A test skill')
    expect(skills[0].path).toBe('/my-skill')
  })

  it('discovers skills in skills/ subdirectory', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skills-discover-sub-'))
    mkdirSync(path.join(dir, 'skills/find-skills'), { recursive: true })
    writeFileSync(
      path.join(dir, 'skills/find-skills/SKILL.md'),
      '---\nname: find-skills\ndescription: Find skills\n---\n',
    )

    const skills = await discoverSkillsInDir(dir)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('find-skills')
    expect(skills[0].path).toBe('/skills/find-skills')
  })

  it('returns empty array when no skills found', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skills-discover-empty-'))
    mkdirSync(path.join(dir, 'some-dir'), { recursive: true })
    writeFileSync(path.join(dir, 'some-dir/README.md'), '# Not a skill\n')

    const skills = await discoverSkillsInDir(dir)
    expect(skills).toHaveLength(0)
  })

  it('uses directory name when frontmatter has no name', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skills-discover-noname-'))
    mkdirSync(path.join(dir, 'cool-skill'), { recursive: true })
    writeFileSync(path.join(dir, 'cool-skill/SKILL.md'), '# Just a heading\n')

    const skills = await discoverSkillsInDir(dir)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('cool-skill')
  })
})

describe('discoverSelfSkillsInDir', () => {
  it('discovers repo-authored skills from skills/ and ignores root and generated dirs', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skills-discover-self-'))
    mkdirSync(path.join(dir, 'root-skill'), { recursive: true })
    writeFileSync(path.join(dir, 'root-skill/SKILL.md'), '# Root skill\n')
    mkdirSync(path.join(dir, '.agents/skills/generated-skill'), { recursive: true })
    writeFileSync(path.join(dir, '.agents/skills/generated-skill/SKILL.md'), '# Generated skill\n')
    mkdirSync(path.join(dir, 'skills/repo-self-skill'), { recursive: true })
    writeFileSync(
      path.join(dir, 'skills/repo-self-skill/SKILL.md'),
      '---\nname: repo-self-skill\ndescription: Repo self skill\n---\n',
    )

    const skills = await discoverSelfSkillsInDir(dir)

    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('repo-self-skill')
    expect(skills[0].path).toBe('/skills/repo-self-skill')
  })
})

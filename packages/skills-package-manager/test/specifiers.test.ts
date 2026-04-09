import { describe, expect, it } from '@rstest/core'
import { isLockInSync } from '../src/config/compareSkillsLock'
import { normalizeSpecifier } from '../src/specifiers/normalizeSpecifier'

describe('normalizeSpecifier', () => {
  it('parses git path specifier', () => {
    expect(
      normalizeSpecifier('https://github.com/acme/skills.git#main&path:/skills/hello'),
    ).toEqual({
      type: 'git',
      source: 'https://github.com/acme/skills.git',
      ref: 'main',
      path: '/skills/hello',
      normalized: 'https://github.com/acme/skills.git#main&path:/skills/hello',
      skillName: 'hello',
    })
  })

  it('parses link specifier that points directly to a skill directory', () => {
    expect(normalizeSpecifier('link:./fixtures/local-source/skills/hello-skill')).toEqual({
      type: 'link',
      source: 'link:./fixtures/local-source/skills/hello-skill',
      ref: null,
      path: '/',
      normalized: 'link:./fixtures/local-source/skills/hello-skill',
      skillName: 'hello-skill',
    })
  })

  it('canonicalizes link specifiers for stable comparisons', () => {
    expect(normalizeSpecifier('link:.\\fixtures\\local-source\\skills\\hello-skill/')).toEqual({
      type: 'link',
      source: 'link:./fixtures/local-source/skills/hello-skill',
      ref: null,
      path: '/',
      normalized: 'link:./fixtures/local-source/skills/hello-skill',
      skillName: 'hello-skill',
    })
  })

  it('rejects link specifiers with path fragments', () => {
    expect(() =>
      normalizeSpecifier('link:./fixtures/local-source#path:/skills/hello-skill'),
    ).toThrow('Invalid link specifier')
  })

  it('parses file tarball specifier', () => {
    expect(normalizeSpecifier('file:./fixtures/skills.tgz#path:/skills/hello-skill')).toEqual({
      type: 'file',
      source: 'file:./fixtures/skills.tgz',
      ref: null,
      path: '/skills/hello-skill',
      normalized: 'file:./fixtures/skills.tgz#path:/skills/hello-skill',
      skillName: 'hello-skill',
    })
  })

  it('parses npm specifier', () => {
    expect(normalizeSpecifier('npm:@acme/skills#path:/skills/hello-skill')).toEqual({
      type: 'npm',
      source: 'npm:@acme/skills',
      ref: null,
      path: '/skills/hello-skill',
      normalized: 'npm:@acme/skills#path:/skills/hello-skill',
      skillName: 'hello-skill',
    })
  })

  it('parses git specifier without ref', () => {
    expect(normalizeSpecifier('https://github.com/acme/skills.git#path:/skills/world')).toEqual({
      type: 'git',
      source: 'https://github.com/acme/skills.git',
      ref: null,
      path: '/skills/world',
      normalized: 'https://github.com/acme/skills.git#path:/skills/world',
      skillName: 'world',
    })
  })

  it('rejects duplicate path fragments', () => {
    expect(() =>
      normalizeSpecifier(
        'https://github.com/acme/skills.git#path:/skills/world#path:/skills/world',
      ),
    ).toThrow('Invalid specifier: multiple # fragments are not supported')
  })

  it('treats equivalent link specifiers as in sync', () => {
    expect(
      isLockInSync(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'hello-skill': 'link:.\\fixtures\\local-source\\skills\\hello-skill/',
          },
        },
        {
          lockfileVersion: '0.1',
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {
            'hello-skill': {
              specifier: 'link:./fixtures/local-source/skills/hello-skill',
              resolution: {
                type: 'link',
                path: './fixtures/local-source/skills/hello-skill',
              },
              digest: 'sha256-test',
            },
          },
        },
      ),
    ).toBe(true)
  })

  it('ignores selfSkill when checking whether a lockfile is in sync', () => {
    expect(
      isLockInSync(
        {
          installDir: '.agents/skills',
          linkTargets: [],
          selfSkill: true,
          skills: {},
        },
        {
          lockfileVersion: '0.1',
          installDir: '.agents/skills',
          linkTargets: [],
          skills: {},
        },
      ),
    ).toBe(true)
  })
})

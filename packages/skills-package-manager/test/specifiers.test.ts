import { describe, expect, it } from '@rstest/core'
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

  it('parses github: protocol specifiers for skills.json', () => {
    expect(normalizeSpecifier('github:acme/skills#abc123&path:/skills/hello')).toEqual({
      type: 'git',
      source: 'https://github.com/acme/skills.git',
      ref: 'abc123',
      path: '/skills/hello',
      normalized: 'github:acme/skills#abc123&path:/skills/hello',
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

  it('canonicalizes link and local specifiers for stable comparisons', () => {
    expect(normalizeSpecifier('link:.\\fixtures\\local-source\\skills\\hello-skill/')).toEqual({
      type: 'link',
      source: 'link:./fixtures/local-source/skills/hello-skill',
      ref: null,
      path: '/',
      normalized: 'link:./fixtures/local-source/skills/hello-skill',
      skillName: 'hello-skill',
    })
    expect(normalizeSpecifier('local:.\\.agents\\skills\\hello-skill/')).toEqual({
      type: 'local',
      source: 'local:./.agents/skills/hello-skill',
      ref: null,
      path: '/',
      normalized: 'local:./.agents/skills/hello-skill',
      skillName: 'hello-skill',
    })
  })

  it('expands local:* using the manifest skill name and installDir', () => {
    expect(
      normalizeSpecifier('local:*', {
        installDir: '.agents/skills',
        skillName: 'docs-en-improvement',
      }),
    ).toEqual({
      type: 'local',
      source: 'local:.agents/skills/docs-en-improvement',
      ref: null,
      path: '/',
      normalized: 'local:.agents/skills/docs-en-improvement',
      skillName: 'docs-en-improvement',
    })
  })

  it('rejects link and local specifiers with path fragments', () => {
    expect(() =>
      normalizeSpecifier('link:./fixtures/local-source#path:/skills/hello-skill'),
    ).toThrow('Invalid link specifier')
    expect(() => normalizeSpecifier('local:./.agents/skills#path:/hello-skill')).toThrow(
      'Invalid local specifier',
    )
  })

  it('parses file tarball specifiers and preserves old #path syntax', () => {
    expect(normalizeSpecifier('file:./fixtures/skills.tgz#path:/skills/hello-skill')).toEqual({
      type: 'file',
      source: 'file:./fixtures/skills.tgz',
      ref: null,
      path: '/skills/hello-skill',
      normalized: 'file:./fixtures/skills.tgz&path:/skills/hello-skill',
      skillName: 'hello-skill',
    })
  })

  it('parses npm specifiers with version and &path syntax', () => {
    expect(normalizeSpecifier('npm:@acme/skills@1.2.3&path:skills/hello-skill')).toEqual({
      type: 'npm',
      source: 'npm:@acme/skills@1.2.3',
      ref: null,
      path: '/skills/hello-skill',
      normalized: 'npm:@acme/skills@1.2.3&path:/skills/hello-skill',
      skillName: 'hello-skill',
    })
  })

  it('infers a root npm skill name from the package name', () => {
    expect(normalizeSpecifier('npm:@acme/hello-skill@1.2.3')).toEqual({
      type: 'npm',
      source: 'npm:@acme/hello-skill@1.2.3',
      ref: null,
      path: '/',
      normalized: 'npm:@acme/hello-skill@1.2.3',
      skillName: 'hello-skill',
    })
  })

  it('rejects duplicate path fragments', () => {
    expect(() =>
      normalizeSpecifier(
        'https://github.com/acme/skills.git#path:/skills/world#path:/skills/world',
      ),
    ).toThrow('Invalid specifier: multiple # fragments are not supported')
  })
})

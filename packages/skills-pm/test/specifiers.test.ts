import { describe, expect, it } from 'vitest'
import { normalizeSpecifier } from '../src/specifiers/normalizeSpecifier'

describe('normalizeSpecifier', () => {
  it('parses git path specifier', () => {
    expect(normalizeSpecifier('https://github.com/acme/skills.git#main&path:/skills/hello')).toEqual({
      type: 'git',
      source: 'https://github.com/acme/skills.git',
      ref: 'main',
      path: '/skills/hello',
      normalized: 'https://github.com/acme/skills.git#main&path:/skills/hello',
      skillName: 'hello',
    })
  })

  it('parses file path specifier', () => {
    expect(normalizeSpecifier('file:./fixtures/local-source#path:/skills/hello-skill')).toEqual({
      type: 'file',
      source: 'file:./fixtures/local-source',
      ref: null,
      path: '/skills/hello-skill',
      normalized: 'file:./fixtures/local-source#path:/skills/hello-skill',
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
      normalizeSpecifier('https://github.com/acme/skills.git#path:/skills/world#path:/skills/world'),
    ).toThrow('Invalid specifier: multiple # fragments are not supported')
  })
})

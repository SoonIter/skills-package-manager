import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { LockEntry, Lockfile, Manifest, Specifier } from '../src'
import { sha256File } from '../src/utils/hash'

describe('public structures', () => {
  it('normalizes manifests and expands the bundled self skill at runtime', () => {
    const manifest = new Manifest({
      skills: {
        hello: 'link:./skills/hello',
      },
      selfSkill: true,
    })

    expect(manifest.normalize()).toEqual({
      installDir: '.agents/skills',
      linkTargets: [],
      selfSkill: true,
      skills: {
        hello: 'link:./skills/hello',
      },
    })
    expect(manifest.withBundledSelfSkill().normalize().skills).toHaveProperty(
      'skills-package-manager-cli',
    )
  })

  it('parses specifiers through the class API', () => {
    expect(
      Specifier.parse('https://github.com/acme/skills.git#main&path:/skills/hello').toJSON(),
    ).toEqual({
      type: 'git',
      source: 'https://github.com/acme/skills.git',
      ref: 'main',
      path: '/skills/hello',
      normalized: 'https://github.com/acme/skills.git#main&path:/skills/hello',
      skillName: 'hello',
    })
  })

  it('checks lockfile sync including patch metadata', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-structures-'))
    const patchPath = path.join(root, 'patches', 'hello.patch')
    mkdirSync(path.dirname(patchPath), { recursive: true })
    writeFileSync(patchPath, 'diff --git a/SKILL.md b/SKILL.md\n', 'utf8')

    const manifest = new Manifest({
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        hello: 'link:./skills/hello',
      },
      patchedSkills: {
        hello: 'patches/hello.patch',
      },
    })

    const lockfile = new Lockfile({
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        hello: new LockEntry({
          specifier: 'link:./skills/hello',
          resolution: {
            type: 'link',
            path: './skills/hello',
          },
          digest: 'sha256-test',
          patch: {
            path: 'patches/hello.patch',
            digest: await sha256File(patchPath),
          },
        }).toJSON(),
      },
    })

    await expect(lockfile.isInSyncWith(manifest, root)).resolves.toBe(true)
  })
})

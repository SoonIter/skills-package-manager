import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { readSkillsManifest } from '../src/config/readSkillsManifest'
import { expandSkillsManifest } from '../src/config/skillsManifest'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'

describe('manifest io', () => {
  it('writes default manifest shape', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-'))
    await writeSkillsManifest(root, { skills: { hello: 'link:./skills/hello' } })
    const manifest = await readSkillsManifest(root)
    expect(manifest).toEqual({
      installDir: '.agents/skills',
      linkTargets: [],
      selfSkill: false,
      skills: { hello: 'link:./skills/hello' },
    })
  })

  it('defaults selfSkill to false when omitted from skills.json', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-manifest-default-self-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify({ installDir: '.agents/skills', linkTargets: [], skills: {} }, null, 2),
    )

    const manifest = await readSkillsManifest(root)

    expect(manifest?.selfSkill).toBe(false)
  })

  it('expands a discovered repo self skill to a link specifier', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-manifest-expand-self-'))
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

    const manifest = await readSkillsManifest(root)
    if (!manifest) {
      throw new Error('Expected manifest to be present')
    }

    const expanded = await expandSkillsManifest(root, manifest)

    expect(expanded.skills).toEqual({
      'repo-self-skill': 'link:./skills/repo-self-skill',
    })
  })

  it('does not expand a self skill when selfSkill is omitted', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-manifest-omit-self-'))
    mkdirSync(path.join(root, 'skills/repo-self-skill'), { recursive: true })
    writeFileSync(
      path.join(root, 'skills/repo-self-skill/SKILL.md'),
      '---\nname: repo-self-skill\ndescription: Repo self skill\n---\n# Repo self skill\n',
    )
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify({ installDir: '.agents/skills', linkTargets: [], skills: {} }, null, 2),
    )

    const manifest = await readSkillsManifest(root)
    if (!manifest) {
      throw new Error('Expected manifest to be present')
    }

    const expanded = await expandSkillsManifest(root, manifest)

    expect(expanded.skills).toEqual({})
  })

  it('does not expand a self skill when selfSkill is false', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-manifest-no-self-'))
    mkdirSync(path.join(root, 'skills/repo-self-skill'), { recursive: true })
    writeFileSync(
      path.join(root, 'skills/repo-self-skill/SKILL.md'),
      '---\nname: repo-self-skill\ndescription: Repo self skill\n---\n# Repo self skill\n',
    )
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify(
        { installDir: '.agents/skills', linkTargets: [], selfSkill: false, skills: {} },
        null,
        2,
      ),
    )

    const manifest = await readSkillsManifest(root)
    if (!manifest) {
      throw new Error('Expected manifest to be present')
    }

    const expanded = await expandSkillsManifest(root, manifest)

    expect(expanded.skills).toEqual({})
    expect(JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8')).selfSkill).toBe(false)
  })
})

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { readSkillsManifest } from '../src/config/readSkillsManifest'
import { skillsManifestSchema } from '../src/config/schema'
import { expandSkillsManifest, getBundledSelfSkillSpecifier } from '../src/config/skillsManifest'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'

const DEFAULT_SCHEMA_URL = 'https://unpkg.com/skills-package-manager@0.5.0/skills.schema.json'

describe('manifest io', () => {
  it('writes default manifest shape', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-'))
    await writeSkillsManifest(root, { skills: { hello: 'link:./skills/hello' } })
    const manifest = await readSkillsManifest(root)
    expect(manifest).toEqual({
      $schema: DEFAULT_SCHEMA_URL,
      installDir: '.agents/skills',
      linkTargets: [],
      skills: { hello: 'link:./skills/hello' },
    })
  })

  it('defaults selfSkill to undefined when omitted from skills.json', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-manifest-default-self-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify({ installDir: '.agents/skills', linkTargets: [], skills: {} }, null, 2),
    )

    const manifest = await readSkillsManifest(root)

    expect(manifest?.selfSkill).toBeUndefined()
  })

  it('expands selfSkill to the bundled skills-package-manager-cli skill', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-manifest-expand-self-'))
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
      'skills-package-manager-cli': getBundledSelfSkillSpecifier(),
    })
  })

  it('does not expand the bundled self skill when selfSkill is omitted', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-manifest-omit-self-'))
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

  it('does not expand the bundled self skill when selfSkill is false', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-manifest-no-self-'))
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

describe('manifest validation', () => {
  it('validates valid manifest with Zod schema', () => {
    const validManifest = {
      $schema: 'https://example.com/schema.json',
      installDir: '.custom/skills',
      linkTargets: ['.claude/skills'],
      selfSkill: true,
      skills: { test: 'link:./test' },
    }

    const result = skillsManifestSchema.safeParse(validManifest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validManifest)
    }
  })

  it('applies defaults for optional fields', () => {
    const minimalManifest = { skills: {} }

    const result = skillsManifestSchema.safeParse(minimalManifest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.installDir).toBe('.agents/skills')
      expect(result.data.linkTargets).toEqual([])
      expect(result.data.selfSkill).toBeUndefined()
      expect(result.data.skills).toEqual({})
    }
  })

  it('rejects invalid manifest types', () => {
    const invalidManifest = {
      installDir: 123,
      skills: 'not-an-object',
    }

    const result = skillsManifestSchema.safeParse(invalidManifest)
    expect(result.success).toBe(false)
  })

  it('throws validation error for invalid skills.json', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-invalid-'))
    writeFileSync(
      path.join(root, 'skills.json'),
      JSON.stringify({ installDir: 123, skills: 'invalid' }),
    )

    await expect(readSkillsManifest(root)).rejects.toThrow('Invalid skills.json')
  })
})

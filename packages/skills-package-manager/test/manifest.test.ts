import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import { readSkillsManifest } from '../src/config/readSkillsManifest'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'

describe('manifest io', () => {
  it('writes default manifest shape', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-'))
    await writeSkillsManifest(root, { skills: { hello: 'file:./skills/hello' } })
    const manifest = await readSkillsManifest(root)
    expect(manifest).toEqual({
      installDir: '.agents/skills',
      linkTargets: [],
      skills: { hello: 'file:./skills/hello' },
    })
  })
})

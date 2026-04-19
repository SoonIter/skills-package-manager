import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import YAML from 'yaml'
import { patchCommand } from '../src/commands/patch'
import { patchCommitCommand } from '../src/commands/patchCommit'
import { readSkillsManifest } from '../src/config/readSkillsManifest'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { installSkills } from '../src/install/installSkills'
import { PATCH_EDIT_STATE_FILE } from '../src/patches/skillPatch'
import { createSkillPackage, packDirectory } from './helpers'

async function withMutedInfo<T>(callback: () => Promise<T>) {
  const info = console.info
  console.info = () => undefined

  try {
    return await callback()
  } finally {
    console.info = info
  }
}

describe('patch workflow', () => {
  it('extracts an editable copy and leaves the manifest unchanged until patch-commit', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-patch-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
    const tarballPath = packDirectory(packageRoot)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
      },
    })

    const result = await withMutedInfo(() => patchCommand({ cwd: root, skillName: 'hello-skill' }))

    expect(readFileSync(path.join(result.editDir, 'SKILL.md'), 'utf8')).toContain('Hello from tgz')
    expect(existsSync(path.join(result.editDir, PATCH_EDIT_STATE_FILE))).toBe(true)

    const manifest = await readSkillsManifest(root)
    expect(manifest?.patchedSkills).toBeUndefined()
    expect(manifest?.skills['hello-skill']).toBe(`file:${tarballPath}#path:/skills/hello-skill`)
  })

  it('commits a patch file, updates manifest and lockfile, and reapplies on install', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-patch-commit-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
    const tarballPath = packDirectory(packageRoot)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
      },
    })

    const patchResult = await withMutedInfo(() =>
      patchCommand({ cwd: root, skillName: 'hello-skill' }),
    )
    writeFileSync(
      path.join(patchResult.editDir, 'SKILL.md'),
      '# Hello from tgz\n\nPatched locally.\n',
      'utf8',
    )

    const patchCommitResult = await withMutedInfo(() =>
      patchCommitCommand({ cwd: root, editDir: patchResult.editDir }),
    )

    const manifest = await readSkillsManifest(root)
    expect(manifest?.patchedSkills).toEqual({
      'hello-skill': 'patches/hello-skill.patch',
    })
    expect(readFileSync(patchCommitResult.patchFile, 'utf8')).toContain('Patched locally.')

    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8')) as {
      skills: Record<string, { patch?: { path: string } }>
    }
    expect(lockfile.skills['hello-skill'].patch?.path).toBe('patches/hello-skill.patch')
    expect(readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')).toContain(
      'Patched locally.',
    )

    rmSync(path.join(root, '.agents/skills'), { recursive: true, force: true })
    await installSkills(root, { frozenLockfile: true })

    expect(readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')).toContain(
      'Patched locally.',
    )
  })

  it('reuses committed patches by default and can ignore them when reopening a patch edit dir', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-patch-reopen-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
    const tarballPath = packDirectory(packageRoot)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
      },
    })

    const initialPatch = await withMutedInfo(() =>
      patchCommand({ cwd: root, skillName: 'hello-skill' }),
    )
    writeFileSync(
      path.join(initialPatch.editDir, 'SKILL.md'),
      '# Hello from tgz\n\nPatched locally.\n',
      'utf8',
    )
    await withMutedInfo(() => patchCommitCommand({ cwd: root, editDir: initialPatch.editDir }))

    const reopenedPatched = await withMutedInfo(() =>
      patchCommand({ cwd: root, skillName: 'hello-skill' }),
    )
    expect(readFileSync(path.join(reopenedPatched.editDir, 'SKILL.md'), 'utf8')).toContain(
      'Patched locally.',
    )

    const reopenedBase = await withMutedInfo(() =>
      patchCommand({ cwd: root, skillName: 'hello-skill', ignoreExisting: true }),
    )
    expect(readFileSync(path.join(reopenedBase.editDir, 'SKILL.md'), 'utf8')).not.toContain(
      'Patched locally.',
    )
  })

  it('ignores nested vcs metadata when generating a patch', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-patch-vcs-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
    const tarballPath = packDirectory(packageRoot)

    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
      },
    })

    const patchResult = await withMutedInfo(() =>
      patchCommand({ cwd: root, skillName: 'hello-skill' }),
    )

    mkdirSync(path.join(patchResult.editDir, '.git'), { recursive: true })
    writeFileSync(
      path.join(patchResult.editDir, '.git', 'config'),
      '[core]\nrepositoryformatversion = 0\n',
    )
    writeFileSync(
      path.join(patchResult.editDir, 'SKILL.md'),
      '# Hello from tgz\n\nPatched with vcs metadata.\n',
    )

    const patchCommitResult = await withMutedInfo(() =>
      patchCommitCommand({ cwd: root, editDir: patchResult.editDir }),
    )

    expect(readFileSync(patchCommitResult.patchFile, 'utf8')).toContain(
      'Patched with vcs metadata.',
    )
  })
})

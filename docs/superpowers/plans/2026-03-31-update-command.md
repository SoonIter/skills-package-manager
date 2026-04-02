# Update Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `spm update` so it refreshes git-based skill resolutions from `skills.json`, skips `file:` skills, validates named targets, and only commits a new lockfile after fetch/link succeeds.

**Architecture:** Refactor the package manager flow into explicit `resolve`, `fetch`, and `link` stages. `install` remains full `resolve -> fetch -> link`, while `update` performs partial `resolve` to create a candidate lock, then runs `fetch` and `link` against that candidate lock before writing `skills-lock.yaml`.

**Tech Stack:** TypeScript, Node.js fs/path/child_process, Rstest, YAML

---

## File Structure

- Modify: `packages/skills-package-manager/src/config/types.ts`
  - Add option/result types for `update` and stage helpers.
- Modify: `packages/skills-package-manager/src/config/syncSkillsLock.ts`
  - Extract reusable resolve helpers for single-specifier and full-lock generation.
- Modify: `packages/skills-package-manager/src/install/installSkills.ts`
  - Split current install flow into command orchestration plus `fetch` and `link` stage functions.
- Create: `packages/skills-package-manager/src/commands/update.ts`
  - Implement `updateCommand` orchestration, target validation, partial resolve, and atomic lock commit semantics.
- Modify: `packages/skills-package-manager/src/commands/install.ts`
  - Keep thin wrapper over the refactored install orchestration.
- Modify: `packages/skills-package-manager/src/cli/runCli.ts`
  - Route `update` command and pass positional skill names.
- Modify: `packages/skills-package-manager/src/index.ts`
  - Export `updateCommand` and any public stage helpers intended for tests.
- Create: `packages/skills-package-manager/test/update.test.ts`
  - Cover update success, skip, failure, and atomic lockfile behavior.
- Modify: `packages/skills-package-manager/README.md`
  - Document `spm update` and stage-oriented behavior.
- Modify: `README.md`
  - Add top-level CLI usage for `spm update`.

### Task 1: Define update/result types and resolve helpers

**Files:**
- Modify: `packages/skills-package-manager/src/config/types.ts`
- Modify: `packages/skills-package-manager/src/config/syncSkillsLock.ts`
- Test: `packages/skills-package-manager/test/update.test.ts`

- [ ] **Step 1: Write the failing test for resolving a git specifier**

```ts
import { describe, expect, it } from '@rstest/core'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --filter resolveLockEntry`
Expected: FAIL with `resolveLockEntry is not exported` or similar missing symbol error

- [ ] **Step 3: Add update/result types and export resolve helper**

```ts
export type UpdateCommandOptions = {
  cwd: string
  skills?: string[]
}

export type UpdateCommandResult = {
  status: 'updated' | 'skipped' | 'failed'
  updated: string[]
  unchanged: string[]
  skipped: Array<{ name: string; reason: 'file-specifier' }>
  failed: Array<{ name: string; reason: string }>
}
```

```ts
export async function resolveLockEntry(cwd: string, specifier: string): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const normalized = normalizeSpecifier(specifier)

  if (normalized.type === 'file') {
    const sourceRoot = path.resolve(cwd, normalized.source.slice('file:'.length))
    return {
      skillName: normalized.skillName,
      entry: {
        specifier: normalized.normalized,
        resolution: { type: 'file', path: sourceRoot },
        digest: sha256(`${sourceRoot}:${normalized.path}`),
      },
    }
  }

  if (normalized.type === 'git') {
    const commit = await resolveGitCommit(normalized.source, normalized.ref)
    return {
      skillName: normalized.skillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'git',
          url: normalized.source,
          commit,
          path: normalized.path,
        },
        digest: sha256(`${normalized.source}:${commit}:${normalized.path}`),
      },
    }
  }

  throw new Error(`Unsupported specifier type in 0.1.0 core flow: ${normalized.type}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --filter resolveLockEntry`
Expected: PASS with 1 test passed

- [ ] **Step 5: Commit**

```bash
git add packages/skills-package-manager/src/config/types.ts packages/skills-package-manager/src/config/syncSkillsLock.ts packages/skills-package-manager/test/update.test.ts
git commit -m "refactor: extract lock resolve helper"
```

### Task 2: Split install into resolve/fetch/link stages without changing install behavior

**Files:**
- Modify: `packages/skills-package-manager/src/install/installSkills.ts`
- Modify: `packages/skills-package-manager/src/commands/install.ts`
- Modify: `packages/skills-package-manager/src/index.ts`
- Test: `packages/skills-package-manager/test/update.test.ts`

- [ ] **Step 1: Write the failing test for atomic fetch/link entrypoints**

```ts
import { describe, expect, it } from '@rstest/core'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { fetchSkillsFromLock, linkSkillsFromLock } from '../src/install/installSkills'
import type { SkillsLock, SkillsManifest } from '../src/config/types'

describe('install stages', () => {
  it('materializes and links skills from a provided lockfile', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-fetch-link-'))
    const sourceRoot = mkdtempSync(path.join(tmpdir(), 'skills-pm-local-source-'))
    mkdirSync(path.join(sourceRoot, 'skills/hello-skill'), { recursive: true })
    writeFileSync(path.join(sourceRoot, 'skills/hello-skill/SKILL.md'), '# Hello stage\n')

    const manifest: SkillsManifest = {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': `file:${sourceRoot}#path:/skills/hello-skill`,
      },
    }

    const lockfile: SkillsLock = {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': {
          specifier: `file:${sourceRoot}#path:/skills/hello-skill`,
          resolution: { type: 'file', path: sourceRoot },
          digest: 'sha256-test',
        },
      },
    }

    await fetchSkillsFromLock(root, manifest, lockfile)
    await linkSkillsFromLock(root, manifest, lockfile)

    const installed = readFileSync(path.join(root, '.agents/skills/hello-skill/SKILL.md'), 'utf8')
    expect(installed).toContain('Hello stage')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --filter "install stages"`
Expected: FAIL with missing `fetchSkillsFromLock` / `linkSkillsFromLock` exports

- [ ] **Step 3: Extract fetch and link stage functions**

```ts
export async function fetchSkillsFromLock(rootDir: string, manifest: SkillsManifest, lockfile: SkillsLock) {
  const lockDigest = sha256(JSON.stringify(lockfile))
  const state = await readInstallState(rootDir)
  if (state?.lockDigest === lockDigest) {
    return { status: 'skipped', reason: 'up-to-date' } as const
  }

  const installDir = manifest.installDir ?? '.agents/skills'
  const linkTargets = manifest.linkTargets ?? []

  await pruneManagedSkills(rootDir, installDir, linkTargets, Object.keys(lockfile.skills))

  for (const [skillName, entry] of Object.entries(lockfile.skills)) {
    if (entry.resolution.type === 'file') {
      await materializeLocalSkill(rootDir, skillName, entry.resolution.path, extractSkillPath(entry.specifier, skillName), installDir)
      continue
    }

    if (entry.resolution.type === 'git') {
      await materializeGitSkill(rootDir, skillName, entry.resolution.url, entry.resolution.commit, entry.resolution.path, installDir)
      continue
    }

    throw new Error(`Unsupported resolution type in 0.1.0 core flow: ${entry.resolution.type}`)
  }

  await writeInstallState(rootDir, {
    lockDigest,
    installDir,
    linkTargets,
    installerVersion: '0.1.0',
    installedAt: new Date().toISOString(),
  })

  return { status: 'fetched', fetched: Object.keys(lockfile.skills) } as const
}
```

```ts
export async function linkSkillsFromLock(rootDir: string, manifest: SkillsManifest, lockfile: SkillsLock) {
  const installDir = manifest.installDir ?? '.agents/skills'
  const linkTargets = manifest.linkTargets ?? []

  for (const skillName of Object.keys(lockfile.skills)) {
    for (const linkTarget of linkTargets) {
      await linkSkill(rootDir, installDir, linkTarget, skillName)
    }
  }

  return { status: 'linked', linked: Object.keys(lockfile.skills) } as const
}
```

```ts
export async function installSkills(rootDir: string) {
  const manifest = await readSkillsManifest(rootDir)
  if (!manifest) {
    return { status: 'skipped', reason: 'manifest-missing' } as const
  }

  const currentLock = await readSkillsLock(rootDir)
  const lockfile = await syncSkillsLock(rootDir, manifest, currentLock)
  await fetchSkillsFromLock(rootDir, manifest, lockfile)
  await linkSkillsFromLock(rootDir, manifest, lockfile)
  await writeSkillsLock(rootDir, lockfile)

  return { status: 'installed', installed: Object.keys(lockfile.skills) } as const
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --filter "install stages"`
Expected: PASS with installed skill materialized under `.agents/skills`

- [ ] **Step 5: Commit**

```bash
git add packages/skills-package-manager/src/install/installSkills.ts packages/skills-package-manager/src/commands/install.ts packages/skills-package-manager/src/index.ts packages/skills-package-manager/test/update.test.ts
git commit -m "refactor: split install into stages"
```

### Task 3: Add CLI routing and minimal update command skeleton

**Files:**
- Modify: `packages/skills-package-manager/src/cli/runCli.ts`
- Create: `packages/skills-package-manager/src/commands/update.ts`
- Modify: `packages/skills-package-manager/src/index.ts`
- Test: `packages/skills-package-manager/test/update.test.ts`

- [ ] **Step 1: Write the failing test for named target validation**

```ts
import { describe, expect, it } from '@rstest/core'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { updateCommand } from '../src/commands/update'

describe('updateCommand validation', () => {
  it('fails when a named skill is not present in skills.json', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-missing-'))
    writeFileSync(path.join(root, 'skills.json'), JSON.stringify({ skills: { alpha: 'file:./alpha#path:/alpha' } }, null, 2))

    await expect(updateCommand({ cwd: root, skills: ['missing'] })).rejects.toThrow(
      'Unknown skill: missing',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --filter "updateCommand validation"`
Expected: FAIL with `Cannot find module '../src/commands/update'` or missing export

- [ ] **Step 3: Add CLI routing and update skeleton**

```ts
if (command === 'update') {
  const { positionals } = parseArgs(rest)
  return updateCommand({ cwd, skills: positionals.length > 0 ? positionals : undefined })
}
```

```ts
import { readSkillsManifest } from '../config/readSkillsManifest'
import type { UpdateCommandOptions, UpdateCommandResult } from '../config/types'

export async function updateCommand(options: UpdateCommandOptions): Promise<UpdateCommandResult> {
  const manifest = await readSkillsManifest(options.cwd)
  if (!manifest) {
    return { status: 'skipped', updated: [], unchanged: [], skipped: [], failed: [] }
  }

  const targetSkills = options.skills ?? Object.keys(manifest.skills)
  for (const skillName of targetSkills) {
    if (!(skillName in manifest.skills)) {
      throw new Error(`Unknown skill: ${skillName}`)
    }
  }

  return {
    status: 'skipped',
    updated: [],
    unchanged: [],
    skipped: [],
    failed: [],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --filter "updateCommand validation"`
Expected: PASS with validation test green

- [ ] **Step 5: Commit**

```bash
git add packages/skills-package-manager/src/cli/runCli.ts packages/skills-package-manager/src/commands/update.ts packages/skills-package-manager/src/index.ts packages/skills-package-manager/test/update.test.ts
git commit -m "feat: add update command skeleton"
```

### Task 4: Implement partial resolve for update targets

**Files:**
- Modify: `packages/skills-package-manager/src/commands/update.ts`
- Modify: `packages/skills-package-manager/src/config/syncSkillsLock.ts`
- Test: `packages/skills-package-manager/test/update.test.ts`

- [ ] **Step 1: Write the failing test for skipping file skills and updating git skills**

```ts
it('updates git targets and skips file targets', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-targets-'))
  const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-git-'))
  const fileRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-file-'))

  mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
  writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Version 1\n')
  execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
  const oldCommit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

  writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Version 2\n')
  execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git commit -m update', { cwd: gitRepo, stdio: 'ignore' })
  const newCommit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

  mkdirSync(path.join(fileRepo, 'local-skill'), { recursive: true })
  writeFileSync(path.join(fileRepo, 'local-skill/SKILL.md'), '# Local\n')

  writeFileSync(path.join(root, 'skills.json'), JSON.stringify({
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {
      'hello-skill': `${gitRepo}#HEAD&path:/skills/hello-skill`,
      'local-skill': `file:${fileRepo}#path:/local-skill`,
    },
  }, null, 2))

  writeFileSync(path.join(root, 'skills-lock.yaml'), YAML.stringify({
    lockfileVersion: '0.1',
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {
      'hello-skill': {
        specifier: `${gitRepo}#HEAD&path:/skills/hello-skill`,
        resolution: { type: 'git', url: gitRepo, commit: oldCommit, path: '/skills/hello-skill' },
        digest: `sha256-${oldCommit}`,
      },
      'local-skill': {
        specifier: `file:${fileRepo}#path:/local-skill`,
        resolution: { type: 'file', path: fileRepo },
        digest: 'sha256-local',
      },
    },
  }))

  const result = await updateCommand({ cwd: root })

  expect(result.updated).toEqual(['hello-skill'])
  expect(result.skipped).toEqual([{ name: 'local-skill', reason: 'file-specifier' }])
  expect(result.failed).toEqual([])
  expect(result.unchanged).toEqual([])
  const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
  expect(lockfile.skills['hello-skill'].resolution.commit).toBe(newCommit)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --filter "updates git targets and skips file targets"`
Expected: FAIL because `updateCommand` returns a placeholder result and does not rewrite the lockfile

- [ ] **Step 3: Implement target selection and partial resolve**

```ts
function createBaseResult(): UpdateCommandResult {
  return { status: 'skipped', updated: [], unchanged: [], skipped: [], failed: [] }
}

export async function updateCommand(options: UpdateCommandOptions): Promise<UpdateCommandResult> {
  const manifest = await readSkillsManifest(options.cwd)
  if (!manifest) {
    return createBaseResult()
  }

  const currentLock = await readSkillsLock(options.cwd)
  const targetSkills = options.skills ?? Object.keys(manifest.skills)
  for (const skillName of targetSkills) {
    if (!(skillName in manifest.skills)) {
      throw new Error(`Unknown skill: ${skillName}`)
    }
  }

  const candidateLock = currentLock ?? {
    lockfileVersion: '0.1',
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    skills: {},
  }

  const result = createBaseResult()

  for (const skillName of targetSkills) {
    const specifier = manifest.skills[skillName]
    if (specifier.startsWith('file:')) {
      result.skipped.push({ name: skillName, reason: 'file-specifier' })
      continue
    }

    try {
      const { entry } = await resolveLockEntry(options.cwd, specifier)
      const previous = currentLock?.skills[skillName]
      if (previous?.resolution.type === 'git' && previous.resolution.commit === entry.resolution.commit) {
        result.unchanged.push(skillName)
        continue
      }
      candidateLock.skills[skillName] = entry
      result.updated.push(skillName)
    } catch (error) {
      result.failed.push({ name: skillName, reason: (error as Error).message })
    }
  }

  if (result.failed.length > 0) {
    result.status = 'failed'
    return result
  }

  result.status = result.updated.length > 0 ? 'updated' : 'skipped'
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- --filter "updates git targets and skips file targets"`
Expected: PASS with `updated`, `skipped`, and new lockfile assertions green

- [ ] **Step 5: Commit**

```bash
git add packages/skills-package-manager/src/commands/update.ts packages/skills-package-manager/src/config/syncSkillsLock.ts packages/skills-package-manager/test/update.test.ts
git commit -m "feat: resolve update targets"
```

### Task 5: Make update atomic across fetch/link and lockfile write

**Files:**
- Modify: `packages/skills-package-manager/src/commands/update.ts`
- Modify: `packages/skills-package-manager/src/install/installSkills.ts`
- Test: `packages/skills-package-manager/test/update.test.ts`

- [ ] **Step 1: Write the failing test for atomic lockfile behavior on install failure**

```ts
it('does not write the new lockfile when fetch fails', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-atomic-'))
  const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-atomic-source-'))

  mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
  writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Atomic v1\n')
  execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
  const oldCommit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

  writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Atomic v2\n')
  execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git commit -m update', { cwd: gitRepo, stdio: 'ignore' })

  writeFileSync(path.join(root, 'skills.json'), JSON.stringify({
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {
      'hello-skill': `${gitRepo}#HEAD&path:/skills/hello-skill`,
    },
  }, null, 2))

  writeFileSync(path.join(root, 'skills-lock.yaml'), YAML.stringify({
    lockfileVersion: '0.1',
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {
      'hello-skill': {
        specifier: `${gitRepo}#HEAD&path:/skills/hello-skill`,
        resolution: { type: 'git', url: gitRepo, commit: oldCommit, path: '/skills/hello-skill' },
        digest: `sha256-${oldCommit}`,
      },
    },
  }))

  await expect(updateCommand({ cwd: root })).rejects.toThrow('Simulated fetch failure')

  const persisted = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
  expect(persisted.skills['hello-skill'].resolution.commit).toBe(oldCommit)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --filter "does not write the new lockfile when fetch fails"`
Expected: FAIL because update currently writes or returns before stage orchestration exists

- [ ] **Step 3: Wire update through fetch/link and write the lock last**

```ts
const fetchResult = await fetchSkillsFromLock(options.cwd, manifest, candidateLock)
await linkSkillsFromLock(options.cwd, manifest, candidateLock)
await writeSkillsLock(options.cwd, candidateLock)

return {
  status: result.updated.length > 0 ? 'updated' : 'skipped',
  updated: result.updated,
  unchanged: result.unchanged,
  skipped: result.skipped,
  failed: result.failed,
}
```

```ts
export async function updateCommand(options: UpdateCommandOptions): Promise<UpdateCommandResult> {
  // validation + partial resolve from Task 4
  if (result.failed.length > 0) {
    result.status = 'failed'
    return result
  }

  await fetchSkillsFromLock(options.cwd, manifest, candidateLock)
  await linkSkillsFromLock(options.cwd, manifest, candidateLock)
  await writeSkillsLock(options.cwd, candidateLock)

  result.status = result.updated.length > 0 ? 'updated' : 'skipped'
  return result
}
```

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `pnpm test -- --filter "updateCommand|install stages"`
Expected: PASS with update and install-stage tests green

- [ ] **Step 5: Commit**

```bash
git add packages/skills-package-manager/src/commands/update.ts packages/skills-package-manager/src/install/installSkills.ts packages/skills-package-manager/test/update.test.ts
git commit -m "feat: make update lockfile writes atomic"
```

### Task 6: Cover unchanged and partial resolve failure cases

**Files:**
- Modify: `packages/skills-package-manager/test/update.test.ts`
- Modify: `packages/skills-package-manager/src/commands/update.ts`

- [ ] **Step 1: Write the failing tests for unchanged commit and partial resolve failure**

```ts
it('marks a target as unchanged when the resolved commit matches the current lock', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-unchanged-'))
  const gitRepo = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-unchanged-source-'))

  mkdirSync(path.join(gitRepo, 'skills/hello-skill'), { recursive: true })
  writeFileSync(path.join(gitRepo, 'skills/hello-skill/SKILL.md'), '# Stable\n')
  execSync('git init', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.email test@example.com', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git config user.name test', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git add .', { cwd: gitRepo, stdio: 'ignore' })
  execSync('git commit -m init', { cwd: gitRepo, stdio: 'ignore' })
  const commit = execSync('git rev-parse HEAD', { cwd: gitRepo }).toString().trim()

  writeFileSync(path.join(root, 'skills.json'), JSON.stringify({
    installDir: '.agents/skills',
    linkTargets: [],
    skills: { 'hello-skill': `${gitRepo}#HEAD&path:/skills/hello-skill` },
  }, null, 2))

  writeFileSync(path.join(root, 'skills-lock.yaml'), YAML.stringify({
    lockfileVersion: '0.1',
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {
      'hello-skill': {
        specifier: `${gitRepo}#HEAD&path:/skills/hello-skill`,
        resolution: { type: 'git', url: gitRepo, commit, path: '/skills/hello-skill' },
        digest: `sha256-${commit}`,
      },
    },
  }))

  const result = await updateCommand({ cwd: root })
  expect(result.unchanged).toEqual(['hello-skill'])
  expect(result.updated).toEqual([])
})

it('returns failed when any target cannot resolve and keeps the old lockfile', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-update-resolve-fail-'))
  writeFileSync(path.join(root, 'skills.json'), JSON.stringify({
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {
      broken: '/definitely/missing/repo.git#main&path:/skills/broken',
    },
  }, null, 2))

  writeFileSync(path.join(root, 'skills-lock.yaml'), YAML.stringify({
    lockfileVersion: '0.1',
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {},
  }))

  const result = await updateCommand({ cwd: root })
  expect(result.status).toBe('failed')
  expect(result.failed).toHaveLength(1)
  const persisted = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))
  expect(persisted.skills).toEqual({})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- --filter "unchanged|failed when any target cannot resolve"`
Expected: FAIL because unchanged/failure semantics are incomplete or wrong

- [ ] **Step 3: Finish result-status rules**

```ts
if (result.failed.length > 0) {
  result.status = 'failed'
  return result
}

result.status = result.updated.length > 0 ? 'updated' : 'skipped'
return result
```

```ts
if (previous?.resolution.type === 'git' && previous.resolution.commit === entry.resolution.commit) {
  result.unchanged.push(skillName)
  continue
}
```

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `pnpm test -- --filter "unchanged|failed when any target cannot resolve"`
Expected: PASS with unchanged and failed result semantics covered

- [ ] **Step 5: Commit**

```bash
git add packages/skills-package-manager/src/commands/update.ts packages/skills-package-manager/test/update.test.ts
git commit -m "test: cover update unchanged and failure cases"
```

### Task 7: Document update command in package and workspace READMEs

**Files:**
- Modify: `packages/skills-package-manager/README.md`
- Modify: `README.md`
- Test: none

- [ ] **Step 1: Write the documentation changes**

```md
### `spm update`

Refresh git-based skills declared in `skills.json` without changing the manifest:

```bash
spm update
spm update find-skills rspress-custom-theme
```

Behavior:

- Uses `skills.json` as the source of truth
- Re-resolves git refs to the latest commit
- Skips `file:` skills
- Fails immediately for unknown skill names
- Writes `skills-lock.yaml` only after fetch and link succeed
```
```

```md
### Update declared skills

```bash
npx skills-package-manager update
npx skills-package-manager update find-skills rspress-custom-theme
```
```

- [ ] **Step 2: Review docs for consistency with the spec**

Run: `git diff -- packages/skills-package-manager/README.md README.md`
Expected: diff shows `update` usage, skip rules, and atomic lockfile behavior

- [ ] **Step 3: Commit**

```bash
git add packages/skills-package-manager/README.md README.md
git commit -m "docs: add update command usage"
```

### Task 8: Run full verification

**Files:**
- Modify: none
- Test: `packages/skills-package-manager/test/add.test.ts`
- Test: `packages/skills-package-manager/test/update.test.ts`

- [ ] **Step 1: Run the package tests**

Run: `pnpm test`
Expected: PASS with add/install/update coverage green

- [ ] **Step 2: Smoke-test the CLI entrypoint**

Run: `node packages/skills-package-manager/dist/bin/spm.js update --help`
Expected: command parses through `runCli`; if there is no `--help` support yet, run `node packages/skills-package-manager/dist/bin/spm.js update` in a temp fixture with `skills.json`

- [ ] **Step 3: Inspect git status**

Run: `git status --short`
Expected: only the intended source, test, and docs files are modified

- [ ] **Step 4: Commit final polish if needed**

```bash
git add packages/skills-package-manager/src packages/skills-package-manager/test packages/skills-package-manager/README.md README.md
git commit -m "chore: finalize update command"
```

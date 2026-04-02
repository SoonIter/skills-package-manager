# Skills PM Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the core `spm` CLI in TypeScript with `@rslib/core`, covering `spm add` and `spm install` for pnpm-style specifiers plus manifest/lock management and local installation.

**Architecture:** The repo will become a small monorepo with `packages/skills-package-manager` for the CLI and `packages/pnpm-plugin-skills` reserved for later pnpm integration. The core implementation will live in focused TypeScript modules for manifest I/O, specifier parsing, lock generation, install state, local filesystem materialization, and command entrypoints. `0.1.0` implementation should prioritize deterministic local/file-based flow first while keeping git-oriented specifier parsing and lock shapes aligned with the agreed design.

**Tech Stack:** TypeScript, Node.js, `@rslib/core`, Vitest, YAML parser/stringifier, fs/path APIs

---

## File structure

- Create: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `packages/skills-package-manager/package.json`
- Create: `packages/skills-package-manager/rslib.config.ts`
- Create: `packages/skills-package-manager/tsconfig.json`
- Create: `packages/skills-package-manager/src/bin/spm.ts`
- Create: `packages/skills-package-manager/src/bin/spm.ts`
- Create: `packages/skills-package-manager/src/cli/runCli.ts`
- Create: `packages/skills-package-manager/src/commands/add.ts`
- Create: `packages/skills-package-manager/src/commands/install.ts`
- Create: `packages/skills-package-manager/src/config/readSkillsManifest.ts`
- Create: `packages/skills-package-manager/src/config/writeSkillsManifest.ts`
- Create: `packages/skills-package-manager/src/config/readSkillsLock.ts`
- Create: `packages/skills-package-manager/src/config/writeSkillsLock.ts`
- Create: `packages/skills-package-manager/src/config/types.ts`
- Create: `packages/skills-package-manager/src/specifiers/parseSpecifier.ts`
- Create: `packages/skills-package-manager/src/specifiers/normalizeSpecifier.ts`
- Create: `packages/skills-package-manager/src/install/installSkills.ts`
- Create: `packages/skills-package-manager/src/install/materializeLocalSkill.ts`
- Create: `packages/skills-package-manager/src/install/installState.ts`
- Create: `packages/skills-package-manager/src/install/links.ts`
- Create: `packages/skills-package-manager/src/utils/hash.ts`
- Create: `packages/skills-package-manager/src/utils/fs.ts`
- Create: `packages/skills-package-manager/src/index.ts`
- Create: `packages/skills-package-manager/test/fixtures/local-source/skills/hello-skill/SKILL.md`
- Create: `packages/skills-package-manager/test/fixtures/local-source/skills/hello-skill/references/example.md`
- Create: `packages/skills-package-manager/test/manifest.test.ts`
- Create: `packages/skills-package-manager/test/specifiers.test.ts`
- Create: `packages/skills-package-manager/test/add.test.ts`
- Create: `packages/skills-package-manager/test/install.test.ts`

### Task 1: Scaffold workspace and package layout

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `tsconfig.json`
- Create: `packages/skills-package-manager/package.json`
- Create: `packages/skills-package-manager/rslib.config.ts`
- Create: `packages/skills-package-manager/tsconfig.json`

- [ ] **Step 1: Write the failing workspace/package test expectation as a checklist comment in plan execution notes**

```txt
Expected repository layout after scaffolding:
- pnpm-workspace.yaml exists
- packages/skills-package-manager/package.json exists
- package.json is private workspace root
- root packageManager is pnpm
```

- [ ] **Step 2: Create workspace manifest**

```yaml
packages:
  - packages/*
```

Write to `pnpm-workspace.yaml`.

- [ ] **Step 3: Replace the root `package.json` with a workspace root manifest**

```json
{
  "name": "skills-package-manager-workspace",
  "private": true,
  "version": "0.1.0",
  "packageManager": "pnpm@10",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test"
  }
}
```

- [ ] **Step 4: Create root TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  }
}
```

Write to `tsconfig.json`.

- [ ] **Step 5: Create `packages/skills-package-manager/package.json`**

```json
{
  "name": "skills-package-manager",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "spm": "dist/bin/spm.js"
  },
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "rslib build",
    "test": "vitest run"
  },
  "dependencies": {
    "yaml": "^2.8.1"
  },
  "devDependencies": {
    "@rslib/core": "^0.6.0",
    "@types/node": "^24.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 6: Create `packages/skills-package-manager/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 7: Create `packages/skills-package-manager/rslib.config.ts`**

```ts
import { defineConfig } from '@rslib/core'

export default defineConfig({
  source: {
    entry: {
      index: './src/index.ts',
      'bin/spm': './src/bin/spm.ts',
      'bin/spm': './src/bin/spm.ts',
    },
  },
  output: {
    target: 'node',
    format: 'esm',
    cleanDistPath: true,
  },
})
```

- [ ] **Step 8: Run workspace install**

Run: `pnpm install`
Expected: workspace dependencies install successfully and `packages/skills-package-manager/node_modules` is created

- [ ] **Step 9: Run build to verify scaffold works**

Run: `pnpm build`
Expected: build succeeds and writes `packages/skills-package-manager/dist`

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.json packages/skills-package-manager/package.json packages/skills-package-manager/tsconfig.json packages/skills-package-manager/rslib.config.ts pnpm-lock.yaml
git commit -m "chore: scaffold spm workspace"
```

### Task 2: Define manifest, lock, and specifier types with tests

**Files:**
- Create: `packages/skills-package-manager/src/config/types.ts`
- Create: `packages/skills-package-manager/src/specifiers/parseSpecifier.ts`
- Create: `packages/skills-package-manager/src/specifiers/normalizeSpecifier.ts`
- Create: `packages/skills-package-manager/test/specifiers.test.ts`

- [ ] **Step 1: Write the failing specifier tests**

```ts
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
})
```

- [ ] **Step 2: Create type definitions**

```ts
export type SkillsManifest = {
  $schema?: string
  installDir?: string
  linkTargets?: string[]
  skills: Record<string, string>
}

export type NormalizedSpecifier = {
  type: 'git' | 'file' | 'npm'
  source: string
  ref: string | null
  path: string
  normalized: string
  skillName: string
}

export type SkillsLock = {
  lockfileVersion: '0.1'
  installDir: string
  linkTargets: string[]
  skills: Record<string, SkillsLockEntry>
}

export type SkillsLockEntry = {
  specifier: string
  resolution:
    | { type: 'file'; path: string }
    | { type: 'git'; url: string; commit: string; path: string }
    | { type: 'npm'; packageName: string; version: string; path: string; integrity?: string }
  digest: string
}
```

Write to `packages/skills-package-manager/src/config/types.ts`.

- [ ] **Step 3: Implement `parseSpecifier`**

```ts
export function parseSpecifier(specifier: string) {
  const [sourcePart, fragment] = specifier.split('#')
  if (!sourcePart) throw new Error('Specifier source is required')

  if (!fragment) {
    return { sourcePart, ref: null, path: '', params: new URLSearchParams() }
  }

  const [refPart, ...rest] = fragment.split('&')
  const hasPathOnly = refPart.startsWith('path:')
  const params = new URLSearchParams()

  if (hasPathOnly) {
    params.set('path', refPart.slice('path:'.length))
  } else {
    params.set('ref', refPart)
  }

  for (const item of rest) {
    const [key, value] = item.split(':')
    if (key && value) params.set(key, value)
  }

  return {
    sourcePart,
    ref: params.get('ref'),
    path: params.get('path') ?? '',
    params,
  }
}
```

- [ ] **Step 4: Implement `normalizeSpecifier`**

```ts
import path from 'node:path'
import { parseSpecifier } from './parseSpecifier'
import type { NormalizedSpecifier } from '../config/types'

export function normalizeSpecifier(specifier: string): NormalizedSpecifier {
  const parsed = parseSpecifier(specifier)
  const type = parsed.sourcePart.startsWith('file:')
    ? 'file'
    : parsed.sourcePart.startsWith('npm:')
      ? 'npm'
      : 'git'

  const skillPath = parsed.path || '/'
  const skillName = path.posix.basename(skillPath)
  const normalized = parsed.ref
    ? `${parsed.sourcePart}#${parsed.ref}&path:${skillPath}`
    : parsed.path
      ? `${parsed.sourcePart}#path:${skillPath}`
      : parsed.sourcePart

  return {
    type,
    source: parsed.sourcePart,
    ref: parsed.ref,
    path: skillPath,
    normalized,
    skillName,
  }
}
```

- [ ] **Step 5: Run tests to verify type/specifier behavior**

Run: `pnpm --filter spm test -- specifiers.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/skills-package-manager/src/config/types.ts packages/skills-package-manager/src/specifiers/parseSpecifier.ts packages/skills-package-manager/src/specifiers/normalizeSpecifier.ts packages/skills-package-manager/test/specifiers.test.ts
git commit -m "feat: add skills specifier parsing"
```

### Task 3: Implement manifest and lock read/write helpers

**Files:**
- Create: `packages/skills-package-manager/src/config/readSkillsManifest.ts`
- Create: `packages/skills-package-manager/src/config/writeSkillsManifest.ts`
- Create: `packages/skills-package-manager/src/config/readSkillsLock.ts`
- Create: `packages/skills-package-manager/src/config/writeSkillsLock.ts`
- Create: `packages/skills-package-manager/test/manifest.test.ts`

- [ ] **Step 1: Write the failing manifest/lock tests**

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { readSkillsManifest } from '../src/config/readSkillsManifest'

describe('manifest io', () => {
  it('writes default manifest shape', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'spm-'))
    await writeSkillsManifest(root, { skills: { hello: 'file:./skills/hello' } })
    const manifest = await readSkillsManifest(root)
    expect(manifest).toEqual({
      installDir: '.agents/skills',
      linkTargets: [],
      skills: { hello: 'file:./skills/hello' },
    })
  })
})
```

- [ ] **Step 2: Implement `readSkillsManifest`**

```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SkillsManifest } from './types'

export async function readSkillsManifest(rootDir: string): Promise<SkillsManifest | null> {
  const filePath = path.join(rootDir, 'skills.json')
  try {
    const raw = await readFile(filePath, 'utf8')
    const json = JSON.parse(raw) as SkillsManifest
    return {
      installDir: json.installDir ?? '.agents/skills',
      linkTargets: json.linkTargets ?? [],
      skills: json.skills ?? {},
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
```

- [ ] **Step 3: Implement `writeSkillsManifest`**

```ts
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SkillsManifest } from './types'

export async function writeSkillsManifest(rootDir: string, manifest: SkillsManifest): Promise<void> {
  const filePath = path.join(rootDir, 'skills.json')
  const nextManifest = {
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    skills: manifest.skills,
  }
  await writeFile(filePath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8')
}
```

- [ ] **Step 4: Implement lock read/write helpers**

```ts
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'
import type { SkillsLock } from './types'

export async function readSkillsLock(rootDir: string): Promise<SkillsLock | null> {
  const filePath = path.join(rootDir, 'skills-lock.yaml')
  try {
    const raw = await readFile(filePath, 'utf8')
    return YAML.parse(raw) as SkillsLock
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function writeSkillsLock(rootDir: string, lockfile: SkillsLock): Promise<void> {
  const filePath = path.join(rootDir, 'skills-lock.yaml')
  await writeFile(filePath, YAML.stringify(lockfile), 'utf8')
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter spm test -- manifest.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/skills-package-manager/src/config/readSkillsManifest.ts packages/skills-package-manager/src/config/writeSkillsManifest.ts packages/skills-package-manager/src/config/readSkillsLock.ts packages/skills-package-manager/src/config/writeSkillsLock.ts packages/skills-package-manager/test/manifest.test.ts
git commit -m "feat: add manifest and lock io"
```

### Task 4: Implement local install primitives and tests

**Files:**
- Create: `packages/skills-package-manager/src/utils/hash.ts`
- Create: `packages/skills-package-manager/src/utils/fs.ts`
- Create: `packages/skills-package-manager/src/install/materializeLocalSkill.ts`
- Create: `packages/skills-package-manager/src/install/links.ts`
- Create: `packages/skills-package-manager/src/install/installState.ts`
- Create: `packages/skills-package-manager/test/fixtures/local-source/skills/hello-skill/SKILL.md`
- Create: `packages/skills-package-manager/test/fixtures/local-source/skills/hello-skill/references/example.md`
- Create: `packages/skills-package-manager/test/install.test.ts`

- [ ] **Step 1: Write the failing install test for a local skill**

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, existsSync, lstatSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { installSkills } from '../src/install/installSkills'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { writeSkillsLock } from '../src/config/writeSkillsLock'

describe('installSkills', () => {
  it('installs a local skill and creates symlinks', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'spm-install-'))
    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': 'file:./test/fixtures/local-source#path:/skills/hello-skill',
      },
    })
    await writeSkillsLock(root, {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: ['.claude/skills'],
      skills: {
        'hello-skill': {
          specifier: 'file:./test/fixtures/local-source#path:/skills/hello-skill',
          resolution: {
            type: 'file',
            path: path.resolve('packages/skills-package-manager/test/fixtures/local-source'),
          },
          digest: 'test-digest',
        },
      },
    })

    await installSkills(root)

    const installedSkill = path.join(root, '.agents/skills/hello-skill/SKILL.md')
    const linkedSkill = path.join(root, '.claude/skills/hello-skill')
    expect(existsSync(installedSkill)).toBe(true)
    expect(lstatSync(linkedSkill).isSymbolicLink()).toBe(true)
    expect(readFileSync(installedSkill, 'utf8')).toContain('Hello skill')
  })
})
```

- [ ] **Step 2: Add local fixture files**

```md
# Hello skill

This is a local fixture skill.
```

Write the content above to `packages/skills-package-manager/test/fixtures/local-source/skills/hello-skill/SKILL.md`.

```md
Example reference document.
```

Write the content above to `packages/skills-package-manager/test/fixtures/local-source/skills/hello-skill/references/example.md`.

- [ ] **Step 3: Implement filesystem helpers**

```ts
import { cp, mkdir, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function replaceDir(from: string, to: string): Promise<void> {
  await rm(to, { recursive: true, force: true })
  await cp(from, to, { recursive: true })
}

export async function replaceSymlink(target: string, linkPath: string): Promise<void> {
  await rm(linkPath, { recursive: true, force: true })
  await symlink(target, linkPath)
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
```

- [ ] **Step 4: Implement digest and state helpers**

```ts
import { createHash } from 'node:crypto'

export function sha256(content: string): string {
  return `sha256-${createHash('sha256').update(content).digest('hex')}`
}
```

```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { writeJson } from '../utils/fs'

export async function readInstallState(rootDir: string) {
  const filePath = path.join(rootDir, '.agents/skills/.spm-install-state.json')
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

export async function writeInstallState(rootDir: string, value: unknown) {
  const filePath = path.join(rootDir, '.agents/skills/.spm-install-state.json')
  await writeJson(filePath, value)
}
```

- [ ] **Step 5: Implement local materialization and symlink creation**

```ts
import { cp, readFile } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, replaceSymlink, writeJson } from '../utils/fs'

export async function materializeLocalSkill(rootDir: string, skillName: string, sourceRoot: string, sourcePath: string, installDir: string) {
  const relativeSkillPath = sourcePath.replace(/^\//, '')
  const absoluteSkillPath = path.join(sourceRoot, relativeSkillPath)
  const skillDoc = await readFile(path.join(absoluteSkillPath, 'SKILL.md'), 'utf8')
  if (!skillDoc) throw new Error(`Invalid skill at ${absoluteSkillPath}: missing SKILL.md`)

  const targetDir = path.join(rootDir, installDir, skillName)
  await ensureDir(path.dirname(targetDir))
  await cp(absoluteSkillPath, targetDir, { recursive: true, force: true })
  await writeJson(path.join(targetDir, '.spm.json'), {
    name: skillName,
    installedBy: 'skills-package-manager',
    version: '0.1.0',
  })
}

export async function linkSkill(rootDir: string, installDir: string, linkTarget: string, skillName: string) {
  const absoluteTarget = path.join(rootDir, installDir, skillName)
  const absoluteLink = path.join(rootDir, linkTarget, skillName)
  await ensureDir(path.dirname(absoluteLink))
  await replaceSymlink(absoluteTarget, absoluteLink)
}
```

- [ ] **Step 6: Run the failing test and verify it now passes once `installSkills` exists as a stub**

Run: `pnpm --filter spm test -- install.test.ts`
Expected: FAIL first because `installSkills` is not implemented

- [ ] **Step 7: Commit fixture and helper work**

```bash
git add packages/skills-package-manager/src/utils/hash.ts packages/skills-package-manager/src/utils/fs.ts packages/skills-package-manager/src/install/materializeLocalSkill.ts packages/skills-package-manager/src/install/links.ts packages/skills-package-manager/src/install/installState.ts packages/skills-package-manager/test/install.test.ts packages/skills-package-manager/test/fixtures/local-source/skills/hello-skill/SKILL.md packages/skills-package-manager/test/fixtures/local-source/skills/hello-skill/references/example.md
git commit -m "feat: add local skill install primitives"
```

### Task 5: Implement `spm install`

**Files:**
- Create: `packages/skills-package-manager/src/install/installSkills.ts`
- Modify: `packages/skills-package-manager/test/install.test.ts`

- [ ] **Step 1: Add a failing install-state test**

```ts
it('skips install when lock digest matches state', async () => {
  // setup omitted in prose during implementation; copy the existing fixture setup
  // assert second install returns skipped result
})
```

Replace the placeholder above during implementation with a full duplicate setup copied from the first test and an assertion on a structured return value.

- [ ] **Step 2: Implement `installSkills`**

```ts
import path from 'node:path'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { readSkillsLock } from '../config/readSkillsLock'
import { sha256 } from '../utils/hash'
import { materializeLocalSkill } from './materializeLocalSkill'
import { linkSkill } from './links'
import { readInstallState, writeInstallState } from './installState'

export async function installSkills(rootDir: string) {
  const manifest = await readSkillsManifest(rootDir)
  if (!manifest) {
    return { status: 'skipped', reason: 'manifest-missing' } as const
  }

  const lockfile = await readSkillsLock(rootDir)
  if (!lockfile) {
    throw new Error('skills-lock.yaml is required when skills.json exists')
  }

  const lockDigest = sha256(JSON.stringify(lockfile))
  const state = await readInstallState(rootDir)
  if (state?.lockDigest === lockDigest) {
    return { status: 'skipped', reason: 'up-to-date' } as const
  }

  for (const [skillName, entry] of Object.entries(lockfile.skills)) {
    if (entry.resolution.type !== 'file') {
      throw new Error(`Unsupported resolution type in 0.1.0 core flow: ${entry.resolution.type}`)
    }

    await materializeLocalSkill(rootDir, skillName, entry.resolution.path, '/skills/' + skillName, manifest.installDir ?? '.agents/skills')

    for (const linkTarget of manifest.linkTargets ?? []) {
      await linkSkill(rootDir, manifest.installDir ?? '.agents/skills', linkTarget, skillName)
    }
  }

  await writeInstallState(rootDir, {
    lockDigest,
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    installerVersion: '0.1.0',
    installedAt: new Date().toISOString(),
  })

  return { status: 'installed', installed: Object.keys(lockfile.skills) } as const
}
```

- [ ] **Step 3: Replace the hardcoded `'/skills/' + skillName` path with lock-driven path data**

```ts
await materializeLocalSkill(
  rootDir,
  skillName,
  entry.resolution.path,
  entry.specifier.includes('#path:')
    ? entry.specifier.split('#path:')[1]
    : `/${skillName}`,
  manifest.installDir ?? '.agents/skills',
)
```

Then refactor this extraction into a tiny helper in the same file if needed.

- [ ] **Step 4: Run install tests**

Run: `pnpm --filter spm test -- install.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/skills-package-manager/src/install/installSkills.ts packages/skills-package-manager/test/install.test.ts
git commit -m "feat: implement spm install"
```

### Task 6: Implement `spm add`

**Files:**
- Create: `packages/skills-package-manager/src/commands/add.ts`
- Create: `packages/skills-package-manager/test/add.test.ts`
- Modify: `packages/skills-package-manager/src/config/types.ts`

- [ ] **Step 1: Write the failing `add` test for file specifiers**

```ts
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import { addCommand } from '../src/commands/add'

describe('addCommand', () => {
  it('writes manifest and lock for a file skill specifier', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'spm-add-'))
    await addCommand({
      cwd: root,
      specifier: 'file:./packages/skills-package-manager/test/fixtures/local-source#path:/skills/hello-skill',
    })

    const manifest = JSON.parse(readFileSync(path.join(root, 'skills.json'), 'utf8'))
    const lockfile = YAML.parse(readFileSync(path.join(root, 'skills-lock.yaml'), 'utf8'))

    expect(manifest.skills['hello-skill']).toBe('file:./packages/skills-package-manager/test/fixtures/local-source#path:/skills/hello-skill')
    expect(lockfile.skills['hello-skill'].resolution.type).toBe('file')
  })
})
```

- [ ] **Step 2: Extend types for command options if needed**

```ts
export type AddCommandOptions = {
  cwd: string
  specifier: string
}
```

Add this to `packages/skills-package-manager/src/config/types.ts` if you need a shared type.

- [ ] **Step 3: Implement `addCommand`**

```ts
import path from 'node:path'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { readSkillsManifest } from '../config/readSkillsManifest'
import { writeSkillsManifest } from '../config/writeSkillsManifest'
import { writeSkillsLock } from '../config/writeSkillsLock'
import { sha256 } from '../utils/hash'

export async function addCommand(options: { cwd: string; specifier: string }) {
  const normalized = normalizeSpecifier(options.specifier)
  const existingManifest = (await readSkillsManifest(options.cwd)) ?? {
    installDir: '.agents/skills',
    linkTargets: [],
    skills: {},
  }

  const existing = existingManifest.skills[normalized.skillName]
  if (existing && existing !== normalized.normalized) {
    throw new Error(`Skill ${normalized.skillName} already exists with a different specifier`)
  }

  existingManifest.skills[normalized.skillName] = normalized.normalized
  await writeSkillsManifest(options.cwd, existingManifest)

  if (normalized.type !== 'file') {
    throw new Error(`Unsupported specifier type in 0.1.0 core flow: ${normalized.type}`)
  }

  const sourceRoot = path.resolve(options.cwd, normalized.source.slice('file:'.length))
  const lockfile = {
    lockfileVersion: '0.1' as const,
    installDir: existingManifest.installDir ?? '.agents/skills',
    linkTargets: existingManifest.linkTargets ?? [],
    skills: {
      [normalized.skillName]: {
        specifier: normalized.normalized,
        resolution: {
          type: 'file' as const,
          path: sourceRoot,
        },
        digest: sha256(`${sourceRoot}:${normalized.path}`),
      },
    },
  }

  await writeSkillsLock(options.cwd, lockfile)
  return {
    skillName: normalized.skillName,
    specifier: normalized.normalized,
  }
}
```

- [ ] **Step 4: Update `addCommand` to preserve existing lock entries**

Replace the single-entry `skills` object with a merge against the current lockfile so adding a second skill does not delete the first one.

- [ ] **Step 5: Run add tests**

Run: `pnpm --filter spm test -- add.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/skills-package-manager/src/commands/add.ts packages/skills-package-manager/src/config/types.ts packages/skills-package-manager/test/add.test.ts
git commit -m "feat: implement spm add"
```

### Task 7: Implement CLI entrypoints for `spm` and `skills`

**Files:**
- Create: `packages/skills-package-manager/src/cli/runCli.ts`
- Create: `packages/skills-package-manager/src/bin/spm.ts`
- Create: `packages/skills-package-manager/src/bin/spm.ts`
- Create: `packages/skills-package-manager/src/commands/install.ts`
- Create: `packages/skills-package-manager/src/index.ts`

- [ ] **Step 1: Write the failing CLI smoke test as manual commands to run after implementation**

```txt
pnpm --filter spm exec spm add file:./packages/skills-package-manager/test/fixtures/local-source#path:/skills/hello-skill
pnpm --filter spm exec spm install
pnpm --filter spm exec spm install
```

Expected:
- first command writes skills.json and skills-lock.yaml
- second command installs hello-skill into .agents/skills
- third command exits successfully and behaves like install

- [ ] **Step 2: Implement install command wrapper**

```ts
import { installSkills } from '../install/installSkills'

export async function installCommand(options: { cwd: string }) {
  return installSkills(options.cwd)
}
```

- [ ] **Step 3: Implement shared CLI runner**

```ts
import { addCommand } from '../commands/add'
import { installCommand } from '../commands/install'

export async function runCli(argv: string[]) {
  const [, , command, ...rest] = argv
  const cwd = process.cwd()

  if (command === 'add') {
    const specifier = rest[0]
    if (!specifier) throw new Error('Missing required specifier')
    return addCommand({ cwd, specifier })
  }

  if (command === 'install') {
    return installCommand({ cwd })
  }

  throw new Error(`Unknown command: ${command}`)
}
```

- [ ] **Step 4: Implement the two bin files**

```ts
#!/usr/bin/env node
import { runCli } from '../cli/runCli'

runCli(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
```

Write the same content to both:
- `packages/skills-package-manager/src/bin/spm.ts`
- `packages/skills-package-manager/src/bin/spm.ts`

- [ ] **Step 5: Export public API**

```ts
export { addCommand } from './commands/add'
export { installCommand } from './commands/install'
export { runCli } from './cli/runCli'
```

Write to `packages/skills-package-manager/src/index.ts`.

- [ ] **Step 6: Build and run CLI smoke commands**

Run: `pnpm build && pnpm --filter spm exec spm add file:./packages/skills-package-manager/test/fixtures/local-source#path:/skills/hello-skill`
Expected: command succeeds and writes manifest/lock in repo root

Run: `pnpm --filter spm exec spm install`
Expected: `.agents/skills/hello-skill/SKILL.md` exists in repo root

Run: `pnpm --filter spm exec spm install`
Expected: command succeeds and is functionally identical to `spm install`

- [ ] **Step 7: Run full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/skills-package-manager/src/cli/runCli.ts packages/skills-package-manager/src/bin/spm.ts packages/skills-package-manager/src/bin/spm.ts packages/skills-package-manager/src/commands/install.ts packages/skills-package-manager/src/index.ts
git commit -m "feat: add cli entrypoints"
```

### Task 8: Self-review and tighten plan-to-code alignment

**Files:**
- Modify: `docs/superpowers/plans/2026-03-30-spm-core.md`

- [ ] **Step 1: Check spec coverage against the saved design notes**

Review `plans/20260330-init.md` and ensure this implementation plan covers:
- workspace setup
- TypeScript + `@rslib/core`
- `spm add`
- `spm install`
- manifest/lock handling
- local install flow
- dual bin entrypoints
- install state/no-op behavior

- [ ] **Step 2: Remove placeholders from the plan**

Search this file for:
- `TODO`
- `TBD`
- `setup omitted`
- `if needed`

Replace each match with concrete instructions before executing the plan.

- [ ] **Step 3: Verify type and naming consistency**

Check that all names used in the plan match exactly:
- `SkillsManifest`
- `SkillsLock`
- `NormalizedSpecifier`
- `addCommand`
- `installCommand`
- `installSkills`
- `runCli`

- [ ] **Step 4: Commit plan adjustments if any**

```bash
git add docs/superpowers/plans/2026-03-30-spm-core.md
git commit -m "docs: refine spm implementation plan"
```

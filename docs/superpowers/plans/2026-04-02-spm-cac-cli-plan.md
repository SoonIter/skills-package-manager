# spm CAC CLI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `spm` CLI entrypoint to `cac`, keep the existing `add` / `install` / `update` / `init` command semantics, and improve help/version/error UX without changing manifest or lockfile behavior.

**Architecture:** Keep `packages/skills-package-manager/src/commands/*.ts` as the business layer and rewrite `packages/skills-package-manager/src/cli/runCli.ts` into a `cac`-based composition layer. Add focused CLI tests for dispatch, help/version, and argument validation, then update the package README so the documented CLI matches the shipped behavior.

**Tech Stack:** TypeScript, ESM, `cac`, `@rstest/core`, Node.js, existing `skills-package-manager` command modules.

---

## File Map

- Modify: `packages/skills-package-manager/package.json`
  - Add the `cac` runtime dependency used by the CLI composition layer.
- Modify: `packages/skills-package-manager/src/cli/runCli.ts`
  - Replace the hand-written argv parsing with `cac` command registration and centralized CLI behavior.
- Modify: `packages/skills-package-manager/test/init.test.ts`
  - Keep the existing `init` coverage, update CLI assertions to match the `cac`-driven behavior, and extend README assertions for help/version docs.
- Create: `packages/skills-package-manager/test/cli.test.ts`
  - Add focused CLI tests for `--help`, `--version`, unknown command behavior, and command dispatch across `add` / `install` / `update` / `init`.
- Modify: `packages/skills-package-manager/README.md`
  - Document top-level usage, `--help`, `--version`, and the current command forms consistently with the new CLI.
- Modify: `pnpm-lock.yaml`
  - Capture the new dependency graph after adding `cac`.

### Task 1: Add `cac` as the CLI dependency

**Files:**
- Modify: `packages/skills-package-manager/package.json`
- Modify: `pnpm-lock.yaml`
- Test: none

- [ ] **Step 1: Write the dependency change in `package.json`**

```json
{
  "dependencies": {
    "@clack/prompts": "^1.1.0",
    "cac": "^7.0.0",
    "picocolors": "^1.1.1",
    "yaml": "^2.8.1"
  }
}
```

- [ ] **Step 2: Install dependencies and update the lockfile**

Run: `pnpm install`
Expected: PASS with `packages/skills-package-manager/package.json` and `pnpm-lock.yaml` updated to include `cac`

- [ ] **Step 3: Verify the lockfile contains `cac`**

Run: `grep -n 'cac' pnpm-lock.yaml`
Expected: PASS with one or more matches for the new `cac` package entry

- [ ] **Step 4: Commit the dependency update**

```bash
git add packages/skills-package-manager/package.json pnpm-lock.yaml
git commit -m "build: add cac for spm cli"
```

### Task 2: Replace the hand-written CLI parser with `cac`

**Files:**
- Modify: `packages/skills-package-manager/src/cli/runCli.ts`
- Test: `packages/skills-package-manager/test/cli.test.ts`

- [ ] **Step 1: Write the failing CLI dispatch tests**

```ts
import { beforeEach, describe, expect, it, vi } from '@rstest/core'

const addCommand = vi.fn()
const installCommand = vi.fn()
const updateCommand = vi.fn()
const initCommand = vi.fn()

vi.mock('../src/commands/add', () => ({ addCommand }))
vi.mock('../src/commands/install', () => ({ installCommand }))
vi.mock('../src/commands/update', () => ({ updateCommand }))
vi.mock('../src/commands/init', () => ({ initCommand }))

const originalArgv = process.argv.slice()
const originalExitCode = process.exitCode
const originalLog = console.log
const originalError = console.error
const originalStdoutWrite = process.stdout.write.bind(process.stdout)
const originalStderrWrite = process.stderr.write.bind(process.stderr)

beforeEach(() => {
  addCommand.mockReset()
  installCommand.mockReset()
  updateCommand.mockReset()
  initCommand.mockReset()
  process.argv = originalArgv.slice()
  process.exitCode = undefined
  console.log = originalLog
  console.error = originalError
})

describe('runCli', () => {
  it('dispatches add with a required specifier and optional --skill', async () => {
    const { runCli } = await import('../src/cli/runCli')

    await runCli(['node', 'spm', 'add', 'owner/repo', '--skill', 'find-skills'], { cwd: '/tmp/project' })

    expect(addCommand).toHaveBeenCalledWith({
      cwd: '/tmp/project',
      specifier: 'owner/repo',
      skill: 'find-skills',
    })
  })

  it('dispatches install without positional args', async () => {
    const { runCli } = await import('../src/cli/runCli')

    await runCli(['node', 'spm', 'install'], { cwd: '/tmp/project' })

    expect(installCommand).toHaveBeenCalledWith({ cwd: '/tmp/project' })
  })

  it('dispatches update with zero or more skill names', async () => {
    const { runCli } = await import('../src/cli/runCli')

    await runCli(['node', 'spm', 'update', 'alpha', 'beta'], { cwd: '/tmp/project' })

    expect(updateCommand).toHaveBeenCalledWith({
      cwd: '/tmp/project',
      skills: ['alpha', 'beta'],
    })
  })

  it('dispatches init with --yes', async () => {
    const { runCli } = await import('../src/cli/runCli')

    await runCli(['node', 'spm', 'init', '--yes'], { cwd: '/tmp/project' })

    expect(initCommand).toHaveBeenCalledWith({ cwd: '/tmp/project', yes: true })
  })
})
```

- [ ] **Step 2: Run the new CLI tests to confirm they fail against the old parser**

Run: `pnpm test packages/skills-package-manager/test/cli.test.ts`
Expected: FAIL because `packages/skills-package-manager/test/cli.test.ts` does not exist yet and `runCli.ts` still uses the old hand-written parser

- [ ] **Step 3: Replace `runCli.ts` with the `cac` composition layer**

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cac } from 'cac'
import { addCommand } from '../commands/add'
import { initCommand } from '../commands/init'
import { installCommand } from '../commands/install'
import { updateCommand } from '../commands/update'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageJsonPath = path.resolve(__dirname, '../../package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string }

export async function runCli(argv: string[], context?: { cwd?: string }) {
  const cwd = context?.cwd ?? process.cwd()
  const cli = cac('spm')

  cli.version(packageJson.version ?? '0.0.0')
  cli.help()

  cli
    .command('add <specifier>', 'Add a skill to skills.json and install it')
    .option('--skill <name>', 'Select a single discovered skill by name')
    .action(async (specifier: string, options: { skill?: string }) => {
      await addCommand({ cwd, specifier, skill: options.skill })
    })

  cli
    .command('install', 'Install all skills declared in skills.json')
    .action(async () => {
      await installCommand({ cwd })
    })

  cli
    .command('update [...skills]', 'Refresh all skills or only the named skills')
    .action(async (skills: string[]) => {
      await updateCommand({ cwd, skills: skills.length > 0 ? skills : undefined })
    })

  cli
    .command('init', 'Create a new skills.json manifest')
    .option('--yes', 'Skip prompts and write the default manifest')
    .action(async (_options: unknown, command: { options: { yes?: boolean } }) => {
      await initCommand({ cwd, yes: Boolean(command.options.yes) })
    })

  cli.command('[...args]').action(() => {
    cli.outputHelp()
  })

  try {
    await cli.parse(argv, { run: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message)
  }
}
```

- [ ] **Step 4: Run the CLI test file again and capture the next failures**

Run: `pnpm test packages/skills-package-manager/test/cli.test.ts`
Expected: FAIL with assertions showing where help output, option parsing, or command signatures differ from the initial test assumptions

- [ ] **Step 5: Adjust the implementation only for the failures you now understand**

```ts
cli.on('command:*', () => {
  throw new Error(`Unknown command: ${cli.args.join(' ')}`)
})

cli
  .command('install', 'Install all skills declared in skills.json')
  .allowUnknownOptions(false)
  .action(async () => {
    await installCommand({ cwd })
  })

cli
  .command('init', 'Create a new skills.json manifest')
  .allowUnknownOptions(false)
  .action(async (_options, command) => {
    await initCommand({ cwd, yes: Boolean(command.options.yes) })
  })
```

- [ ] **Step 6: Re-run the focused CLI tests**

Run: `pnpm test packages/skills-package-manager/test/cli.test.ts`
Expected: PASS for the dispatch cases covering `add`, `install`, `update`, and `init`

- [ ] **Step 7: Commit the CLI refactor**

```bash
git add packages/skills-package-manager/src/cli/runCli.ts packages/skills-package-manager/test/cli.test.ts
git commit -m "feat: migrate spm cli to cac"
```

### Task 3: Cover help, version, and CLI argument errors

**Files:**
- Modify: `packages/skills-package-manager/test/cli.test.ts`
- Modify: `packages/skills-package-manager/test/init.test.ts`

- [ ] **Step 1: Add failing tests for help, version, and argument validation**

```ts
it('shows top-level help when no command is provided', async () => {
  const { runCli } = await import('../src/cli/runCli')
  let stdout = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write

  await runCli(['node', 'spm'], { cwd: '/tmp/project' })

  expect(stdout).toContain('spm')
  expect(stdout).toContain('add')
  expect(stdout).toContain('install')
  expect(stdout).toContain('update')
  expect(stdout).toContain('init')
})

it('shows version output from package.json', async () => {
  const { runCli } = await import('../src/cli/runCli')
  let stdout = ''
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write

  await runCli(['node', 'spm', '--version'], { cwd: '/tmp/project' })

  expect(stdout.trim()).toMatch(/^0\.2\.0$/)
})

it('rejects init extra positional arguments', async () => {
  const { runCli } = await import('../src/cli/runCli')

  await expect(runCli(['node', 'spm', 'init', 'extra'], { cwd: '/tmp/project' })).rejects.toThrow()
})

it('rejects init --yes when provided a value', async () => {
  const { runCli } = await import('../src/cli/runCli')

  await expect(runCli(['node', 'spm', 'init', '--yes', 'true'], { cwd: '/tmp/project' })).rejects.toThrow()
})
```

- [ ] **Step 2: Run the focused tests and observe which CLI behaviors still differ**

Run: `pnpm test packages/skills-package-manager/test/cli.test.ts packages/skills-package-manager/test/init.test.ts`
Expected: FAIL on at least one of help output, version output, or `init` argument validation until the `cac` configuration matches the desired behavior

- [ ] **Step 3: Tighten the `cac` setup to match the approved CLI behavior**

```ts
cli
  .command('init', 'Create a new skills.json manifest')
  .usage('init [--yes]')
  .option('--yes', 'Skip prompts and write the default manifest')
  .action(async (maybeArg: string | undefined, command: { options: { yes?: boolean } }) => {
    if (typeof maybeArg === 'string') {
      throw new Error('init does not accept positional arguments')
    }

    await initCommand({ cwd, yes: Boolean(command.options.yes) })
  })
```

- [ ] **Step 4: Update the existing README assertions so they check the expanded CLI docs**

```ts
describe('documentation', () => {
  it('documents CLI help and init usage in the package README', () => {
    const readme = readFileSync(path.resolve(__dirname, '..', 'README.md'), 'utf8')

    expect(readme).toContain('## CLI Usage')
    expect(readme).toContain('spm --help')
    expect(readme).toContain('spm --version')
    expect(readme).toContain('### `spm init`')
    expect(readme).toContain('spm init --yes')
  })
})
```

- [ ] **Step 5: Re-run the CLI-focused tests**

Run: `pnpm test packages/skills-package-manager/test/cli.test.ts packages/skills-package-manager/test/init.test.ts`
Expected: PASS with help/version behavior covered and `init` validation aligned to the approved UX boundary

- [ ] **Step 6: Commit the validation and help/version tests**

```bash
git add packages/skills-package-manager/test/cli.test.ts packages/skills-package-manager/test/init.test.ts
git commit -m "test: cover spm cli help and validation"
```

### Task 4: Update the README to match the shipped CLI

**Files:**
- Modify: `packages/skills-package-manager/README.md`
- Test: `packages/skills-package-manager/test/init.test.ts`

- [ ] **Step 1: Write the README changes so the top-level CLI usage matches the `cac` entrypoint**

```md
## CLI Usage

```bash
spm --help
spm --version
spm add <specifier> [--skill <name>]
spm install
spm update [skill...]
spm init [--yes]
```
```

- [ ] **Step 2: Keep the per-command sections aligned with the current semantics**

```md
### `spm install`

Install all skills declared in `skills.json`.

```bash
spm install
```

This command does not accept positional arguments.
```

- [ ] **Step 3: Run the README assertion test**

Run: `pnpm test packages/skills-package-manager/test/init.test.ts`
Expected: PASS with the README still documenting `spm init --yes` and the new top-level CLI usage

- [ ] **Step 4: Commit the README update**

```bash
git add packages/skills-package-manager/README.md packages/skills-package-manager/test/init.test.ts
git commit -m "docs: document spm cac cli usage"
```

### Task 5: Run the package test suite and finish the branch cleanly

**Files:**
- Modify: none
- Test: `packages/skills-package-manager/test/*.test.ts`

- [ ] **Step 1: Run the package-level test suite before claiming completion**

Run: `pnpm test`
Expected: PASS with the `skills-package-manager` test suite green after the `cac` migration

- [ ] **Step 2: Check the working tree is clean except for intended changes**

Run: `git status --short`
Expected: PASS with no unexpected modified files

- [ ] **Step 3: Commit the final verification-only changes if any remain**

```bash
git add packages/skills-package-manager/package.json pnpm-lock.yaml packages/skills-package-manager/src/cli/runCli.ts packages/skills-package-manager/test/cli.test.ts packages/skills-package-manager/test/init.test.ts packages/skills-package-manager/README.md
git commit -m "feat: improve spm cli experience"
```

- [ ] **Step 4: Record the final verification output in your handoff**

```text
Tests: pnpm test
Status: git status --short
```

# spm

Core library and CLI for managing agent skills.

## CLI Usage

### `spm add`

Add skills to your project.

```bash
# Interactive — clone repo, discover skills, select via multiselect prompt
spm add owner/repo
spm add https://github.com/owner/repo

# Non-interactive — add a specific skill by name
spm add owner/repo --skill find-skills

# Direct specifier — skip discovery
spm add https://github.com/owner/repo.git#path:/skills/my-skill
spm add file:./local-source#path:/skills/my-skill
```

After `spm add`, the newly added skills are resolved, materialized into `installDir`, and linked to each configured `linkTarget` immediately.

#### How it works

When given `owner/repo` or a GitHub URL:

1. Shallow-clones the repository into a temp directory
2. Scans for `SKILL.md` files (checks root, then `skills/`, `.agents/skills/`, etc.)
3. Presents an interactive multiselect prompt (powered by [@clack/prompts](https://github.com/bombshell-dev/clack))
4. Writes selected skills to `skills.json` and resolves `skills-lock.yaml`
5. Cleans up the temp directory

### `spm init`

Create a new `skills.json` manifest in the current directory.

```bash
# Interactive — prompt for installDir and linkTargets
spm init

# Non-interactive — write the default manifest immediately
spm init --yes
```

Behavior:

- `spm init` prompts for `installDir` and `linkTargets`, then writes `skills.json`
- `spm init --yes` skips prompts and writes the default manifest
- If `skills.json` already exists, the command fails and does not overwrite it

Default `skills.json` written by `spm init --yes`:

```json
{
  "installDir": ".agents/skills",
  "linkTargets": [],
  "skills": {}
}
```

### `spm install`

Install all skills declared in `skills.json`:

```bash
spm install
```

This resolves each skill from its specifier, materializes it into `installDir` (default `.agents/skills/`), and creates symlinks for each `linkTarget`.

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

## Programmatic API

```typescript
import { addCommand, installCommand, listRepoSkills } from 'skills-package-manager'

// Add a skill
await addCommand({
  cwd: process.cwd(),
  specifier: 'vercel-labs/skills',
  skill: 'find-skills',
})

// Install all skills from skills.json
await installCommand({ cwd: process.cwd() })

// List skills in a GitHub repo (clone + scan)
const skills = await listRepoSkills('vercel-labs', 'skills')
// => [{ name: 'find-skills', description: '...', path: '/skills/find-skills' }]
```

## Specifier Format

```
<source>#[ref&]path:<skill-path>
```

| Part | Description | Example |
|------|-------------|---------|
| `source` | Git URL or `file:` path | `https://github.com/o/r.git`, `file:./local` |
| `ref` | Optional git ref | `main`, `v1.0.0`, `HEAD`, `6cb0992`, `6cb0992a176f2ca142e19f64dca8ac12025b035e` |
| `path` | Path to skill directory within source | `/skills/my-skill` |

`ref` can point to a branch, tag, full commit SHA, or short commit SHA.

### Resolution Types

- **`git`** — Clones the repo, resolves commit hash, copies skill files
- **`file`** — Reads from local filesystem, computes content digest

## Architecture

```
src/
├── bin/           # CLI entry points (spm, skills)
├── cli/           # CLI runner and interactive prompts
├── commands/      # add, install command implementations
├── config/        # skills.json / skills-lock.yaml read/write
├── github/        # Git clone + skill discovery (listSkills)
├── install/       # Skill materialization, linking, pruning
├── specifiers/    # Specifier parsing and normalization
└── utils/         # Hashing, filesystem helpers
```

## Build

```bash
pnpm build    # Builds with Rslib (ESM output + DTS)
```

## Test

```bash
pnpm test     # Runs tests with Rstest
```
``

# skills-pm

Core library and CLI for managing agent skills.

## CLI Usage

### `skills add`

Add skills to your project.

```bash
# Interactive — clone repo, discover skills, select via multiselect prompt
skills add owner/repo
skills add https://github.com/owner/repo

# Non-interactive — add a specific skill by name
skills add owner/repo --skill find-skills

# Direct specifier — skip discovery
skills add https://github.com/owner/repo.git#path:/skills/my-skill
skills add file:./local-source#path:/skills/my-skill
```

#### How it works

When given `owner/repo` or a GitHub URL:

1. Shallow-clones the repository into a temp directory
2. Scans for `SKILL.md` files (checks root, then `skills/`, `.agents/skills/`, etc.)
3. Presents an interactive multiselect prompt (powered by [@clack/prompts](https://github.com/bombshell-dev/clack))
4. Writes selected skills to `skills.json` and resolves `skills-lock.yaml`
5. Cleans up the temp directory

### `skills install`

Install all skills declared in `skills.json`:

```bash
skills install
```

This resolves each skill from its specifier, materializes it into `installDir` (default `.agents/skills/`), and creates symlinks for each `linkTarget`.

## Programmatic API

```typescript
import { addCommand, installCommand, listRepoSkills } from 'skills-pm'

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
| `ref` | Optional git ref | `main`, `v1.0.0`, `HEAD` |
| `path` | Path to skill directory within source | `/skills/my-skill` |

### Resolution Types

- **`git`** — Clones the repo, resolves commit hash, copies skill files
- **`file`** — Reads from local filesystem, computes content digest

## Architecture

```
src/
├── bin/           # CLI entry points (skills-pm, skills)
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

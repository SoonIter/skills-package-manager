# skills-package-manager

Core library and CLI for managing agent skills.

## CLI Usage

For one-off usage, `npx skills-package-manager install` is the shared starting point for both new projects and projects migrating from another skills CLI.

```bash
npx skills-package-manager --help
npx skills-package-manager --version
npx skills-package-manager install
npx skills-package-manager add <specifier> [--skill <name>...]
npx skills-package-manager patch <skill>
npx skills-package-manager patch-commit <edit-dir>
npx skills-package-manager update [skill...]
npx skills-package-manager init [--yes]
```

- `npx skills-package-manager` with no command shows top-level help
- `npx skills-package-manager --help` prints top-level help
- `npx skills-package-manager --version` prints the package version

### `npx skills-package-manager add`

Add skills to your project.

For teams already familiar with `npx skills add ...`, the headline migration message is:

```bash
npx skills add owner/repo
# becomes
npx skills-package-manager add owner/repo
```

```bash
# Interactive — clone repo, discover skills, select via multiselect prompt
npx skills-package-manager add owner/repo
npx skills-package-manager add https://github.com/owner/repo
npx skills-package-manager add https://gitlab.com/org/repo
npx skills-package-manager add git@github.com:owner/repo.git
npx skills-package-manager add ./my-local-skills

# Non-interactive — add one or more specific skills by name
npx skills-package-manager add owner/repo --skill find-skills
npx skills-package-manager add owner/repo -s frontend-design -s skill-creator
npx skills-package-manager add owner/repo@find-skills
npx skills-package-manager add owner/repo#main@find-skills

# Direct repo subpath
npx skills-package-manager add owner/repo/skills/my-skill
npx skills-package-manager add https://github.com/owner/repo/tree/main/skills/my-skill

# Inspect or target agents with skills CLI-compatible flags
npx skills-package-manager add owner/repo --list
npx skills-package-manager add owner/repo --all
npx skills-package-manager add owner/repo -a claude-code -a opencode

# Direct specifier — skip discovery
npx skills-package-manager add 'github:owner/repo#abc1234&path:/skills/my-skill'
npx skills-package-manager add link:./local-source/skills/my-skill
npx skills-package-manager add 'local:*' --skill my-skill
npx skills-package-manager add ./local-source
npx skills-package-manager add 'file:./skills-package.tgz&path:/skills/my-skill'
npx skills-package-manager add 'npm:@scope/skills-package@1.0.0&path:/skills/my-skill'
```

After `npx skills-package-manager add`, the newly added skills are resolved, installed or registered according to their protocol, and linked to each configured `linkTarget` immediately.
GitHub sources are written back to `skills.json` as pinned `github:owner/repo#<commit>&path:<path>` specifiers.
The `--copy` flag is accepted for `npx skills add` command-line compatibility; SPM still keeps one canonical install directory and links configured agent targets from there.

#### How it works

When given `owner/repo` or a GitHub URL:

1. Shallow-clones the repository into a temp directory
2. Scans for `SKILL.md` files (checks root, then `skills/`, `.agents/skills/`, etc.)
3. Presents an interactive multiselect prompt (powered by [@clack/prompts](https://github.com/bombshell-dev/clack))
4. Writes selected, pinned skill specifiers to `skills.json`
5. Cleans up the temp directory

### `npx skills-package-manager init`

Create a new `skills.json` manifest in the current directory.

```bash
# Interactive — prompt for installDir and linkTargets
npx skills-package-manager init

# Non-interactive — write the default manifest immediately
npx skills-package-manager init --yes
```

Behavior:

- `npx skills-package-manager init` prompts for `installDir` and `linkTargets`, then writes `skills.json`
- `npx skills-package-manager init --yes` skips prompts and writes the default manifest
- If `skills.json` already exists, the command fails and does not overwrite it

Default `skills.json` written by `npx skills-package-manager init --yes`:

```json
{
  "installDir": ".agents/skills",
  "linkTargets": [],
  "selfSkill": false,
  "skills": {}
}
```

### `npx skills-package-manager install`

Bootstrap the project and install all skills declared in `skills.json`:

```bash
npx skills-package-manager install
```

This resolves each skill from its specifier, installs managed skills into `installDir` (default `.agents/skills/`), registers `local:` skills in place, and creates symlinks for each `linkTarget`.
When `selfSkill` is `true`, `npx skills-package-manager install` also installs the bundled `skills-package-manager-cli` skill so users get guidance for `skills.json` and `npx skills-package-manager` commands. This helper skill is injected at install time and is not written to `skills.json`.
If `patchedSkills` contains an entry for a managed skill, the corresponding patch file is applied after the skill is materialized. `local:` skills cannot be patched because their source directories are user-owned.

If `skills.json` does not exist, `install` bootstraps one first. For migrated projects, it scans `.agents/skills` and `.agent/skills` for direct child directories with `SKILL.md`, writes them as `local:*` entries, and adds `.claude/skills` as a link target when that directory already exists. When a Vercel `skills-lock.json` is present, matching lock entries are used as the migration source so stale local directories are not adopted accidentally. For new projects with no local skills yet, it writes an empty default manifest.

Skills can declare top-level frontmatter dependencies:

```yaml
---
name: workflow-skill
dependencies:
  shared-helper: "github:owner/repo#main&path:/skills/shared-helper"
---
```

`install` recursively installs those dependencies and writes the resolved pins to `skills.json.dependencies` after the install succeeds. Existing `skills.json.dependencies` entries override frontmatter specifiers for the same name, and stale dependency locks are pruned.

### `npx skills-package-manager patch`

Prepare a skill for patching without changing the manifest yet:

```bash
npx skills-package-manager patch hello-skill
npx skills-package-manager patch hello-skill --edit-dir ./tmp/hello-skill
```

Behavior:

- Resolves the current manifest content for the target skill
- Extracts an editable copy into a temporary directory by default
- Reapplies any committed patch for that skill unless `--ignore-existing` is passed
- Writes patch edit metadata so `patch-commit` can generate a new patch file later

### `npx skills-package-manager patch-commit`

Commit an edited patch directory back into the project:

```bash
npx skills-package-manager patch-commit /tmp/skills-pm-patch-hello-skill-12345
npx skills-package-manager patch-commit ./tmp/hello-skill --patches-dir ./custom-patches
```

Behavior:

- Compares the edited directory with the original resolved skill content
- Writes a unified diff patch file to `patches/<skill>.patch` by default
- Updates `skills.json` through the `patchedSkills` field
- Reinstalls and relinks the patched skill so the working tree reflects the committed patch

### `npx skills-package-manager update`

Refresh resolvable skills declared in `skills.json` and write the updated pins back to the manifest:

```bash
npx skills-package-manager update
npx skills-package-manager update find-skills rspress-custom-theme
```

Behavior:

- Uses `skills.json` as the source of truth
- Updates git skills to the latest `main` commit and npm skills to the registry `latest` version
- Skips local `link:`, `local:`, and `file:` skills
- Without named targets, updates both root `skills` and dependency locks before recomputing the dependency closure
- Named update targets must be root `skills`; dependency-only names fail immediately
- Writes `skills.json` only after the updated install succeeds

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

```text
git/file/npm: <source>[#ref][&path:<skill-path>]
link: link:<path-to-skill-dir>
local: local:<path-to-existing-skill-dir>
local shorthand: local:*
```

| Part | Description | Example |
|------|-------------|---------|
| `source` | Git URL or `github:` shorthand, direct `link:` or `local:` skill path, `file:` tarball, or `npm:` package name | `github:o/r`, `https://github.com/o/r.git`, `link:./local/skills/my-skill`, `local:*`, `file:./skills.tgz`, `npm:@scope/pkg@1.0.0` |
| `ref` | Optional git ref | `main`, `v1.0.0`, `HEAD`, `6cb0992`, `6cb0992a176f2ca142e19f64dca8ac12025b035e` |
| `path` | Path to skill directory within source | `/skills/my-skill` |

`ref` can point to a branch, tag, full commit SHA, or short commit SHA.

### Resolution Types

- **`git`** — Clones the repo, resolves commit hash, copies skill files
- **`link`** — Symlinks a local skill directory into `installDir`
- **`local`** — Uses an existing user-owned skill directory in place
- **`file`** — Extracts a local `tgz` package and copies the selected skill
- **`npm`** — Resolves a package from the configured npm registry and installs from the downloaded tarball

`npm:` reads `registry` and scoped `@scope:registry` values from `.npmrc`. Matching `:_authToken`, `:_auth`, or `username` + `:_password` entries are also used for private registry requests.

## Architecture

```
src/
├── bin/           # CLI entry points
├── cli/           # CLI runner and interactive prompts
├── commands/      # add, install, patch command implementations
├── config/        # skills.json read/write and in-memory install plan resolution
├── github/        # Git clone + skill discovery (listSkills)
├── install/       # Skill materialization, linking, pruning
├── patches/       # Patch edit state, diff generation, patch application
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

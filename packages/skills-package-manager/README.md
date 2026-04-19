# skills-package-manager

Core library and CLI for managing agent skills.

## CLI Usage

For one-off usage, `npx skills-package-manager add ...` is the low-friction migration path for teams already familiar with `npx skills add ...`.

```bash
npx skills-package-manager --help
npx skills-package-manager --version
npx skills-package-manager add <specifier> [--skill <name>]
npx skills-package-manager install
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

# Non-interactive — add a specific skill by name
npx skills-package-manager add owner/repo --skill find-skills
npx skills-package-manager add owner/repo@find-skills
npx skills-package-manager add owner/repo#main@find-skills

# Direct repo subpath
npx skills-package-manager add owner/repo/skills/my-skill
npx skills-package-manager add https://github.com/owner/repo/tree/main/skills/my-skill#main

# Direct specifier — skip discovery
npx skills-package-manager add https://github.com/owner/repo.git#path:/skills/my-skill
npx skills-package-manager add link:./local-source/skills/my-skill
npx skills-package-manager add ./local-source
npx skills-package-manager add file:./skills-package.tgz#path:/skills/my-skill
npx skills-package-manager add npm:@scope/skills-package#path:/skills/my-skill
```

After `npx skills-package-manager add`, the newly added skills are resolved, materialized into `installDir`, and linked to each configured `linkTarget` immediately.

#### How it works

When given `owner/repo` or a GitHub URL:

1. Shallow-clones the repository into a temp directory
2. Scans for `SKILL.md` files (checks root, then `skills/`, `.agents/skills/`, etc.)
3. Presents an interactive multiselect prompt (powered by [@clack/prompts](https://github.com/bombshell-dev/clack))
4. Writes selected skills to `skills.json` and resolves `skills-lock.yaml`
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

Install all skills declared in `skills.json`:

```bash
npx skills-package-manager install
```

This resolves each skill from its specifier, materializes it into `installDir` (default `.agents/skills/`), and creates symlinks for each `linkTarget`.
When `selfSkill` is `true`, `npx skills-package-manager install` also installs the bundled `skills-package-manager-cli` skill so users get guidance for `skills.json`, `skills-lock.yaml`, and `npx skills-package-manager` commands. This helper skill is not written to `skills-lock.yaml`.
If `patchedSkills` contains an entry for a skill, the corresponding patch file is applied after the skill is materialized.

### `npx skills-package-manager patch`

Prepare a skill for patching without changing the manifest yet:

```bash
npx skills-package-manager patch hello-skill
npx skills-package-manager patch hello-skill --edit-dir ./tmp/hello-skill
```

Behavior:

- Resolves the currently locked content for the target skill
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
- Updates `skills-lock.yaml` with patch path and digest metadata
- Reinstalls and relinks the patched skill so the working tree reflects the committed patch

### `npx skills-package-manager update`

Refresh resolvable skills declared in `skills.json` without changing the manifest:

```bash
npx skills-package-manager update
npx skills-package-manager update find-skills rspress-custom-theme
```

Behavior:

- Uses `skills.json` as the source of truth
- Re-resolves git refs and npm package targets
- Skips `link:` skills, including the bundled self skill
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

```text
git/file/npm: <source>#[ref&]path:<skill-path>
link: link:<path-to-skill-dir>
```

| Part | Description | Example |
|------|-------------|---------|
| `source` | Git URL, direct `link:` skill path, `file:` tarball, or `npm:` package name | `https://github.com/o/r.git`, `link:./local/skills/my-skill`, `file:./skills.tgz`, `npm:@scope/pkg` |
| `ref` | Optional git ref | `main`, `v1.0.0`, `HEAD`, `6cb0992`, `6cb0992a176f2ca142e19f64dca8ac12025b035e` |
| `path` | Path to skill directory within source | `/skills/my-skill` |

`ref` can point to a branch, tag, full commit SHA, or short commit SHA.

### Resolution Types

- **`git`** — Clones the repo, resolves commit hash, copies skill files
- **`link`** — Reads from a local directory and copies the selected skill
- **`file`** — Extracts a local `tgz` package and copies the selected skill
- **`npm`** — Resolves a package from the configured npm registry, locks the tarball URL/version/integrity, and installs from the downloaded tarball

`npm:` reads `registry` and scoped `@scope:registry` values from `.npmrc`. Matching `:_authToken`, `:_auth`, or `username` + `:_password` entries are also used for private registry requests.

## Architecture

```
src/
├── bin/           # CLI entry points
├── cli/           # CLI runner and interactive prompts
├── commands/      # add, install, patch command implementations
├── config/        # skills.json / skills-lock.yaml read/write
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
``

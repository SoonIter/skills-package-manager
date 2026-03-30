# skills-pm

A package manager for [agent skills](https://skills.sh) — manage, install, and link SKILL.md-based skills into your AI coding agents.

## Overview

skills-pm is a monorepo that provides:

- **[skills-pm](./packages/skills-pm/)** — Core library and CLI for managing agent skills
- **[pnpm-plugin-skills](./packages/pnpm-plugin-skills/)** — pnpm plugin that auto-installs skills during `pnpm install`

## Quick Start

### Add a skill from GitHub

```bash
# Interactive — browse and select skills
npx skills-pm add vercel-labs/skills

# By name
npx skills-pm add vercel-labs/skills --skill find-skills

# Full GitHub URL
npx skills-pm add https://github.com/rstackjs/agent-skills --skill rspress-custom-theme
```

### Add a local skill

```bash
npx skills-pm add file:./my-skills#path:/skills/my-skill
```

### Install all skills

```bash
npx skills-pm install
```

## How It Works

skills-pm uses two files to manage skills:

### `skills.json` — Manifest

Declares which skills to install and where to put them:

```jsonc
{
  "installDir": ".agents/skills",
  "linkTargets": [".cursor/skills"],
  "skills": {
    "find-skills": "https://github.com/vercel-labs/skills.git#path:/skills/find-skills",
    "my-local-skill": "file:./local-source#path:/skills/my-local-skill"
  }
}
```

### `skills-lock.yaml` — Lockfile

Locks resolved versions (git commits, file digests) for reproducible installs:

```yaml
lockfileVersion: "0.1"
installDir: .agents/skills
skills:
  find-skills:
    specifier: https://github.com/vercel-labs/skills.git#path:/skills/find-skills
    resolution:
      type: git
      url: https://github.com/vercel-labs/skills.git
      commit: abc1234...
      path: /skills/find-skills
    digest: sha256-...
```

## Specifier Format

Skills are referenced using specifiers with the following format:

| Type | Example |
|------|---------|
| GitHub shorthand | `owner/repo` |
| GitHub URL | `https://github.com/owner/repo` |
| Git + path | `https://github.com/owner/repo.git#path:/skills/my-skill` |
| Git + ref + path | `https://github.com/owner/repo.git#main&path:/skills/my-skill` |
| Local file | `file:./local-dir#path:/skills/my-skill` |

## pnpm Integration

Install `pnpm-plugin-skills` as a config dependency to auto-install skills on every `pnpm install`:

```bash
pnpm add pnpm-plugin-skills --config
```

This adds it to `configDependencies` in `pnpm-workspace.yaml` automatically.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Project Structure

```
skills-pm/
├── packages/
│   ├── skills-pm/          # Core library and CLI
│   └── pnpm-plugin-skills/ # pnpm plugin (auto-install on pnpm install)
├── skills.json             # Manifest (which skills to install)
├── skills-lock.yaml        # Lockfile (resolved versions)
└── pnpm-workspace.yaml
```

## Tech Stack

- **TypeScript** — Strict mode
- **Rslib** — Build tool (bundle mode)
- **Rstest** — Test runner
- **pnpm** — Package manager with workspace support

## License

ISC

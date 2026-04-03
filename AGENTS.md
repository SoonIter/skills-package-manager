# AGENTS.md

## Project Structure

- `packages/skills-package-manager`: core library and `spm` CLI.
- `packages/pnpm-plugin-skills`: pnpm plugin that syncs skills during install.
- `website`: Rspress documentation site.
- Root files such as `skills.json` and `skills-lock.yaml` document example skill manifests and lock state.

## Documentation Structure

Before you start your PR, check if you need to update the documents. The documentation site (`website/docs/`) is organized as follows:

- **Getting Started**: `getting-started.mdx` - Quick start guide for new users.
- **API Reference** (`api/`):
  - `index.mdx` - API overview and introduction.
  - `commands.mdx` - CLI command reference.
  - `specifiers.mdx` - Skill specifier format and options.
- **Architecture** (`architecture/`):
  - `how-it-works.mdx` - High-level system overview.
  - `cli-commands.mdx` - CLI command implementation details.
  - `manifest-and-lockfile.mdx` - Manifest and lockfile formats.
  - `pnpm-plugin.mdx` - pnpm plugin integration details.
- **Public Assets** (`public/`): Logos and favicon files.

## Development Commands

- `pnpm install`: install workspace dependencies.
- `pnpm build`: build all packages except the docs site.
- `pnpm build:website`: build the Rspress site.
- `pnpm test`: run the test suite with `rstest`.
- `pnpm --filter website dev`: start the local docs dev server.

## Coding Conventions

- Use TypeScript and follow the existing module style in each package.
- Match existing formatting, naming, and file organization before introducing new patterns.
- Keep changes focused; avoid adding abstractions, comments, or files unless they are necessary.
- Preserve manifest, lockfile, and CLI terminology consistently across code and docs.

## Testing Expectations

- Add or update tests when changing CLI behavior, specifier parsing, install flow, or lockfile behavior.
- Prefer targeted tests under `packages/*/test`, following the existing `@rstest/core` style.
- Run `pnpm test` before opening a pull request.
- For docs-only changes, build the site with `pnpm build:website` if the change affects routing, components, or MDX structure.

## Commit and Pull Request Guidelines

- Use clear, conventional commit messages such as `feat: add file specifier validation` or `fix: preserve lockfile resolution`.
- Keep pull requests scoped to one change or theme.
- Include a brief summary, testing notes, and screenshots for docs/UI changes when relevant.
- Link related issues or context, and note any manifest or lockfile changes explicitly.

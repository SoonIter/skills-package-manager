---
name: skills-package-manager-cli
description: Maintain the skills-package-manager monorepo when work touches `skills.json`, `skills-lock.yaml`, the `spm` add/init/install/update flows, specifier parsing, manifest or lockfile behavior, local `link:` and `file:` handling, npm or git resolution, `packages/pnpm-plugin-skills`, or docs under `website/docs/`. Use when editing files in `packages/skills-package-manager`, `packages/pnpm-plugin-skills`, the root manifest/lock examples, or this repository's own self skill under `packages/skills-package-manager/skills/`.
---

# skills-package-manager Maintainer

Maintain the monorepo with an emphasis on manifest and lockfile correctness, install behavior, and docs parity. Treat code, tests, and examples as one change surface.

## Workflow

1. Map the request to the relevant package.
   - `packages/skills-package-manager`: core manifest, specifier, lockfile, CLI, install, and test logic.
   - `packages/pnpm-plugin-skills`: pnpm entrypoint and workspace-root install behavior.
   - `website/docs/`: public docs for commands, manifest/lockfile, specifiers, and architecture.

2. Inspect the behavior before editing.
   - Read the affected command or config path first.
   - If the request changes `skills.json`, `skills-lock.yaml`, specifier semantics, or install behavior, also inspect the matching tests under `packages/skills-package-manager/test`.

3. Keep manifest and lock terminology exact.
   - Preserve `manifest`, `lockfile`, `installDir`, `linkTargets`, `skills`, and specifier terms consistently.
   - Distinguish local `link:` skills from packaged `file:` tarballs and `npm:` packages.

4. Update the right examples when behavior changes.
   - If defaults or manifest fields change, update the root `skills.json` and `skills-lock.yaml` examples.
   - Update matching docs in `website/docs/getting-started.mdx`, `website/docs/_pnpm.mdx`, `website/docs/api/commands.mdx`, and `website/docs/architecture/manifest-and-lockfile.mdx` when examples or behavior descriptions drift.

5. Update tests with the code.
   - Add or update targeted tests for CLI behavior, manifest expansion, specifier parsing, install flow, update flow, and lockfile comparison.
   - Prefer focused package tests first, then run the full `pnpm test` suite before finishing.

## Self Skill Rules

- Treat `packages/skills-package-manager/skills/skills-package-manager-cli` as the repository self skill.
- Keep its `SKILL.md` and `agents/openai.yaml` aligned when changing its behavior or trigger wording.
- When the repository supports automatic self-skill installation, ensure code, tests, root examples, and docs all describe the same bundled-skill behavior and defaults.

## Validation Checklist

- Confirm the changed command or helper has at least one direct test.
- Run `pnpm test` after touching install flow, specifier parsing, manifest defaults, update behavior, or docs-linked examples.
- If the skill itself changes, validate the folder structure and frontmatter before finishing.

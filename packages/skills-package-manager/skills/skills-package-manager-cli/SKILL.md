---
name: skills-package-manager-cli
description: Help users work in repositories that use skills-package-manager. Use when requests mention `skills.json`, `skills-lock.yaml`, `selfSkill`, `npx skills-package-manager init`,  `add`, `install`, `update`, skill specifiers, install directories like `.agents/skills`, or linked skill directories like `.claude/skills`
---

# skills-package-manager

Use this skill for repositories that already use `skills-package-manager`, or when a user needs help understanding and editing its manifest, lockfile, and CLI workflow.

## Core Model

- `skills.json` is the source of truth.
  It declares which skills a repo wants, where to materialize them, where to link them, and whether to include the bundled helper skill.
- `skills-lock.yaml` is resolved state.
  It pins commits, versions, paths, and digests so installs are reproducible.
- Installed directories such as `.agents/skills` and linked directories such as `.claude/skills` are outputs.
  They are produced from the manifest and lockfile; they are not the canonical config.

## What `selfSkill` Means

- `selfSkill: true` adds the bundled `skills-package-manager-cli` skill during install.
- It is meant to help users who see `skills.json`, `skills-lock.yaml`, and `spm` commands but do not yet know how they fit together.
- The bundled skill is injected automatically. It should not be added manually under `skills` unless there is a very specific reason.

## Command Guide

1. `npx skills-package-manager init`
   - Creates `skills.json`.
   - `npx skills-package-manager init --yes` writes the default manifest immediately.

2. `npx skills-package-manager add <specifier> [--skill <name>]`
   - Adds a skill to `skills.json`.
   - Resolves it into `skills-lock.yaml`.
   - Installs it into `installDir` and links it into each `linkTarget`.

3. `npx skills-package-manager install`
   - Reconciles the manifest, lockfile, and installed output.
   - Without `--frozen-lockfile`, it updates `skills-lock.yaml` when needed.
   - With `--frozen-lockfile`, it requires the lockfile to already match the manifest.

4. `npx skills-package-manager update [skill...]`
   - Refreshes resolvable entries in `skills-lock.yaml`.
   - Skips `link:` skills, including the bundled `skills-package-manager-cli` self skill.

## How To Triage User Questions

1. If the user wants to change which skills a repo uses:
   Edit `skills.json`, then run `npx skills-package-manager install`.

2. If the user wants to understand pinned versions or why a change happened:
   Inspect `skills-lock.yaml`.

3. If the user says a skill is missing in their agent:
   Check `installDir`, `linkTargets`, generated skill directories, and symlinks.

4. If the user is confused about `selfSkill`:
   Explain that it enables the bundled `skills-package-manager-cli` helper skill, not an arbitrary repo-local skill.

## Specifier Reminders

- `link:./path/to/skill-dir` points to a local skill directory.
- `file:./pkg.tgz#path:/skills/name` points to a packaged tarball plus skill path.
- `npm:@scope/pkg#path:/skills/name` resolves a package from the configured registry.
- GitHub shorthand or Git URLs resolve remote repositories and may need `--skill` when multiple skills are available.

## Validation Checklist

- Keep `manifest`, `lockfile`, `installDir`, `linkTargets`, `skills`, and `specifier` terminology exact.
- Treat `skills-lock.yaml` as generated state unless the task is specifically about lockfile internals or checked-in examples.
- If you change this bundled skill inside the `skills-package-manager` repo, revalidate the skill folder and update any checked-in lockfile digest that refers to it.

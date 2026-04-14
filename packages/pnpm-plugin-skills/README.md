# pnpm-plugin-skills

A pnpm plugin that automatically installs agent skills during `pnpm install`.

## How It Works

This plugin hooks into pnpm's `preResolution` lifecycle to run skill installation before dependency resolution. On every `pnpm install`, it:

1. Reads `skills.json` from the workspace root
2. Resolves and syncs `skills-lock.yaml`
3. Materializes skills into the configured `installDir`
4. Creates symlinks for configured `linkTargets`
5. Skips if the lockfile hasn't changed (fast path)

## Setup

Install as a config dependency:

```bash
pnpm add pnpm-plugin-skills --config
```

Then create a `skills.json` in your project root:

```jsonc
{
  "installDir": ".agents/skills",
  "linkTargets": [".claude/skills"],
  "pnpmPlugin": {
    "removePnpmfileChecksum": true
  },
  "skills": {
    "my-skill": "https://github.com/owner/repo.git#path:/skills/my-skill"
  }
}
```

`pnpmPlugin.removePnpmfileChecksum` is a temporary compatibility switch for repositories that need `pnpm-plugin-skills` to remove `pnpmfileChecksum` from `pnpm-lock.yaml` in `afterAllResolved`.

Now `pnpm install` will automatically install your skills.

## Architecture

The plugin is built as a single CJS bundle (via Rslib with `autoExternal: false`) that inlines all dependencies including `skills-package-manager`. This ensures it works as a standalone `pnpmfile.cjs` plugin without any external runtime dependencies.

```
pnpm-plugin-skills/
├── pnpmfile.cjs     # Plugin entry — exports { hooks: { preResolution } }
├── src/
│   └── index.ts     # Imports installCommand from skills-pm
└── dist/
    └── index.js     # Bundled CJS output (~350 kB, all deps inlined)
```

## Build

```bash
pnpm build    # Builds with Rslib (CJS bundle mode)
```

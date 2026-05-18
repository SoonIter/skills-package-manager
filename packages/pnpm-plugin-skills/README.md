# pnpm-plugin-skills

A pnpm plugin that automatically installs agent skills during `pnpm install`.

## How It Works

This plugin hooks into pnpm's `preResolution` lifecycle to run skill installation before dependency resolution. On every `pnpm install`, it:

1. Reads `skills.json` from the workspace root
2. Resolves the manifest into an in-memory installation plan
3. Materializes skills into the configured `installDir`
4. Creates symlinks for configured `linkTargets`
5. Updates the internal install state for future incremental runs

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
  "skills": {
    "my-skill": "github:owner/repo#abc1234&path:/skills/my-skill"
  }
}
```

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

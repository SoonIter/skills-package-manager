<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./website/docs/public/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="./website/docs/public/logo-light.svg">
  <img alt="skills-package-manager logo" src="./website/docs/public/logo-light.svg" width="200">
</picture>

<h1>skills-package-manager</h1>

<p>
  <strong>A package manager for <a href="https://skills.sh">agent skills</a></strong><br>
  Manage, install, and link SKILL.md-based skills into your AI coding agents
</p>

<p>
  <a href="https://www.npmjs.com/package/skills-package-manager">
    <img src="https://img.shields.io/npm/v/skills-package-manager.svg?style=flat-square&color=blue" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/skills-package-manager">
    <img src="https://img.shields.io/npm/dm/skills-package-manager.svg?style=flat-square&color=success" alt="npm downloads">
  </a>
  <img src="https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/pnpm-supported-orange?style=flat-square&logo=pnpm" alt="pnpm">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-ISC-blueviolet?style=flat-square" alt="license">
  </a>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-features">Features</a> •
  <a href="#-how-it-works">How It Works</a> •
  <a href="#-specifier-format">Specifier Format</a> •
  <a href="#-documentation">Documentation</a>
</p>

---

</div>

## ✨ Features

- 🚀 **Zero-config setup** — Get started with a single command
- 🔗 **Git-based versioning** — Lock to specific commits, tags, or branches
- 📦 **pnpm integration** — Auto-install skills during `pnpm install`
- 🎯 **Multiple sources** — GitHub repos, local files, or npm packages
- 🔒 **Reproducible installs** — Lockfile ensures consistent environments
- ⚡ **Parallel resolution** — Fast dependency resolution
- 🧩 **AI agent ready** — Seamless integration with Claude and other agents

## 🚀 Quick Start

### Initialize a project

```bash
# Create a new skills.json manifest
npx skills-package-manager init

# Or skip the prompts
npx skills-package-manager init --yes
```

### Add skills

```bash
# 🔍 Interactive — browse and select from a repo
npx skills-package-manager add vercel-labs/skills

# 🎯 Direct — specify skill by name
npx skills-package-manager add vercel-labs/skills --skill find-skills

# 🔗 Full GitHub URL
npx skills-package-manager add https://github.com/rstackjs/agent-skills --skill rspress-custom-theme

# 📁 Local skill directory
npx skills-package-manager add link:./my-skills/my-skill
```

### Install all skills

```bash
npx skills-package-manager install
```

> 💡 **Tip:** Use `--frozen-lockfile` in CI/CD to ensure reproducible installs without modifying the lockfile.

### Update skills

```bash
# Update all skills
npx skills-package-manager update

# Update specific skills only
npx skills-package-manager update find-skills rspress-custom-theme
```

## 📋 Usage Scenarios

| Scenario | Command | Why |
|:---------|:--------|:----|
| 🏠 First time setup | `npx skills-package-manager install` | Creates lockfile if missing |
| 🔄 After `git pull` | `npx skills-package-manager install` | Updates skills if manifest changed |
| 🏭 CI/CD pipeline | `npx skills-package-manager install --frozen-lockfile` | Ensures exact versions, fails on misconfig |
| ⬆️ Version updates | `npx skills-package-manager update` | Updates lockfile with latest versions |

## 🏗️ How It Works

skills-package-manager uses two files to manage your skills:

### `skills.json` — Manifest

Declares which skills to install and where to put them:

```jsonc
{
  "installDir": ".agents/skills",
  "linkTargets": [".claude/skills"],
  "selfSkill": false,
  "skills": {
    // GitHub skill with path
    "find-skills": "https://github.com/vercel-labs/skills.git#path:/skills/find-skills",
    // Local skill directory
    "my-local-skill": "link:./local-source/skills/my-local-skill",
    // Short form — uses repo root
    "create-ex": "https://github.com/therealXiaomanChu/ex-skill.git"
  }
}
```

When `selfSkill` is `true`, skills-package-manager also installs its bundled `skills-package-manager-cli` skill so users get guidance for `skills.json`, `skills-lock.yaml`, and the `spm` workflow. This helper skill is not written to `skills-lock.yaml`.

### `skills-lock.yaml` — Lockfile

Locks resolved versions for reproducible installs:

```yaml
lockfileVersion: "0.1"
installDir: .agents/skills
linkTargets:
  - .claude/skills
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

## 📝 Specifier Format

| Type | Format | Example |
|:-----|:-------|:--------|
| GitHub shorthand | `owner/repo` | `vercel-labs/skills` |
| GitHub URL | `https://github.com/owner/repo` | `https://github.com/vercel-labs/skills` |
| Git + path | `url.git#path:/skills/name` | `https://github.com/owner/repo.git#path:/skills/my-skill` |
| Git + ref + path | `url.git#ref&path:/skills/name` | `https://github.com/owner/repo.git#main&path:/skills/my-skill` |
| Local link | `link:./path/to/skill-dir` | `link:./local-source/skills/my-skill` |
| Local tarball | `file:./skills-package.tgz#path:/skills/name` | `file:./skills-package.tgz#path:/skills/my-skill` |

## 🔌 pnpm Integration

Install `pnpm-plugin-skills` as a config dependency for auto-install on every `pnpm install`:

```bash
pnpm add pnpm-plugin-skills --config
```

This automatically adds it to `configDependencies` in `pnpm-workspace.yaml`.

## 📚 Documentation

- 📖 [Getting Started Guide](https://skills-package-manager.site/getting-started)
- 📘 [API Reference](https://skills-package-manager.site/api/)
- 🏗️ [Architecture](https://skills-package-manager.site/architecture/how-it-works)

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the test suite
pnpm test

# Start docs dev server
pnpm --filter website dev
```

### Project Structure

```
skills-package-manager/
├── packages/
│   ├── skills-package-manager/  # Core library and spm CLI
│   └── pnpm-plugin-skills/      # pnpm plugin (auto-install on pnpm install)
├── website/                     # Documentation site (Rspress)
├── skills.json                  # Example manifest
├── skills-lock.yaml             # Example lockfile
└── pnpm-workspace.yaml
```

## 🧰 Tech Stack

| Technology | Purpose |
|:-----------|:--------|
| ![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) | Strict type checking |
| ![Rslib](https://img.shields.io/badge/-Rslib-000000?style=flat) | Modern build tool (bundle mode) |
| ![Rstest](https://img.shields.io/badge/-Rstest-000000?style=flat) | Fast test runner |
| ![pnpm](https://img.shields.io/badge/-pnpm-F69220?style=flat&logo=pnpm&logoColor=white) | Package manager with workspace support |
| ![Rspress](https://img.shields.io/badge/-Rspress-000000?style=flat) | Documentation site generator |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

[ISC](./LICENSE) © [skills.sh](https://skills.sh)

---

<div align="center">

**[⬆ Back to Top](#skills-package-manager)**

Made with ❤️ for AI coding agents

</div>

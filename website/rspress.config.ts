import * as path from 'node:path'
import { defineConfig } from '@rspress/core'
import pluginFileTree from 'rspress-plugin-file-tree'
import { pluginFontOpenSans } from 'rspress-plugin-font-open-sans'
import pluginMermaid from 'rspress-plugin-mermaid'

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'skills-package-manager | The Next-Gen Agent Skill Manager',
  logoText: 'skills-package-manager',
  description:
    'Manage, install, and link SKILL.md-based AI agent skills with lockfile-driven reproducibility and multi-protocol support.',
  logo: {
    light: '/logo-light.svg',
    dark: '/logo-dark.svg',
  },
  llms: true,
  icon: '/favicon.svg',
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/SoonIter/skills-package-manager',
      },
    ],
    darkMode: false,
  },
  plugins: [pluginMermaid(), pluginFontOpenSans(), pluginFileTree()],
})

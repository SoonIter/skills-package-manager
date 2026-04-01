import * as path from 'path';
import { defineConfig } from '@rspress/core';
import pluginMermaid from 'rspress-plugin-mermaid';
import { pluginFontOpenSans } from 'rspress-plugin-font-open-sans';

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'skills-package-manager',
  logoText: 'Skills Package Manager',
  description: 'Manage, install, and link SKILL.md-based agent skills.',
  logo: {
    light: '/logo-light.svg',
    dark: '/logo-dark.svg',
  },
  icon: '/favicon.svg',
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/SoonIter/skills-pm',
      },
    ],
    darkMode: false,
  },
  plugins: [pluginMermaid(), pluginFontOpenSans()],
});
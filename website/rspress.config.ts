import * as path from 'path';
import { defineConfig } from '@rspress/core';
import pluginMermaid from 'rspress-plugin-mermaid'

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  title: 'Clarity',
  description: 'AI Product Minimalism Theme',
  themeConfig: {
    socialLinks: [
      { icon: 'github', mode: 'link', content: 'https://github.com/web-infra-dev/rspress' },
    ]
  },
  plugins: [pluginMermaid()]
});

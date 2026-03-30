import { defineConfig } from '@rslib/core'

export default defineConfig({
  lib: [
    {
      format: 'esm',
      dts: true,
      source: {
        entry: {
          index: './src/index.ts',
          'bin/skills-pm': './src/bin/skills-pm.ts',
          'bin/skills': './src/bin/skills.ts',
        },
      },
      output: {
        target: 'node',
        cleanDistPath: true,
      },
    },
  ],
})

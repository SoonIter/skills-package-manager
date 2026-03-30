import { defineConfig } from '@rslib/core'

export default defineConfig({
  lib: [
    {
      bundle: true,
      format: 'cjs',
      autoExternal: false,
      source: {
        entry: {
          index: './src/index.ts',
        },
      },
      output: {
        target: 'node',
        cleanDistPath: true,
      },
    },
  ],
})

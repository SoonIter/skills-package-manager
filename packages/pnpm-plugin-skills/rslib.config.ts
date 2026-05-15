import { defineConfig } from '@rslib/core'

export default defineConfig({
  lib: [
    {
      bundle: true,
      format: 'cjs',
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
    {
      bundle: true,
      format: 'esm',
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

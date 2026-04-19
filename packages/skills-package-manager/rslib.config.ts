import { defineConfig } from '@rslib/core'

export default defineConfig({
  lib: [
    {
      format: 'esm',
      dts: {
        bundle: true,
      },
      source: {
        entry: {
          index: './src/index.ts',
        },
      },
      splitChunks: {
        preset: 'per-package',
      },
      output: {
        target: 'node',
        cleanDistPath: true,
      },
    },
  ],
})

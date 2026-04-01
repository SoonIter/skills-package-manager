import { defineConfig } from '@rslib/core'

export default defineConfig({
  lib: [
    {
      format: 'esm',
      dts: false,
      source: {
        entry: {
          index: './src/index.ts'
        },
      },
      output: {
        target: 'node',
        cleanDistPath: true,
      },
    },
  ],
})

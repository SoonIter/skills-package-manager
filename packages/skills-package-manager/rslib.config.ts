import { defineConfig } from '@rslib/core'

export default defineConfig({
  lib: [
    {
      format: 'esm',
      dts: true,
      source: {
        entry: {
          index: './src/index.ts',
          'bin/spm': './src/bin/spm.ts',
        },
      },
      output: {
        target: 'node',
        cleanDistPath: true,
      },
    },
  ],
})

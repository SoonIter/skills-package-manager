import { defineConfig } from '@rstest/core'

export default defineConfig({
  name: 'node',
  globals: false,
  testEnvironment: 'node',
  testTimeout: 30000,
  include: ['packages/**/*.test.{ts,tsx}'],
  exclude: ['**/node_modules/**'],
  setupFiles: ['./scripts/rstest.setup.ts'],
})

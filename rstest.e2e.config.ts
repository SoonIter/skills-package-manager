import { defineConfig } from '@rstest/core'

export default defineConfig({
  name: 'e2e',
  globals: false,
  testEnvironment: 'node',
  testTimeout: 60000,
  include: ['e2e/cases/**/*.test.ts'],
  exclude: ['**/node_modules/**'],
  setupFiles: ['./scripts/rstest.setup.ts'],
})

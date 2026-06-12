import path from 'node:path'
import { expect } from '@rstest/core'
import { createSnapshotSerializer } from 'path-serializer'

function normalizePlaceholderPathSeparators(value: string): string {
  return value.replace(/(<[A-Za-z][A-Za-z0-9_-]*>)\\+/g, '$1/')
}

expect.addSnapshotSerializer(
  createSnapshotSerializer({
    root: path.join(__dirname, '..'),
    beforeSerialize: normalizePlaceholderPathSeparators,
    features: {
      escapeDoubleQuotes: false,
      transformCLR: false,
    },
  }),
)

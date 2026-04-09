/**
 * Script to generate JSON Schema from Zod schema
 * Run with: pnpm tsx scripts/generate-schema.ts
 */
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { skillsManifestSchema } from '../packages/skills-package-manager/src/config/schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

// Use createRequire to import from the workspace package
const requireFromPackage = createRequire(
  new URL('../packages/skills-package-manager/package.json', import.meta.url),
)
const { zodToJsonSchema } = requireFromPackage('zod-to-json-schema') as {
  zodToJsonSchema: typeof import('zod-to-json-schema').zodToJsonSchema
}

async function main() {
  const jsonSchema = zodToJsonSchema(skillsManifestSchema, {
    name: 'skillsManifest',
    $refStrategy: 'none',
  })

  // Add $schema field for JSON Schema draft
  const output = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...jsonSchema,
  }

  // Generate at root (for reference)
  const rootOutputPath = path.join(rootDir, 'skills.schema.json')
  await writeFile(rootOutputPath, JSON.stringify(output, null, 2) + '\n')
  console.log(`✅ Generated JSON Schema (root): ${rootOutputPath}`)

  // Generate in package directory (for npm publishing)
  const pkgOutputPath = path.join(rootDir, 'packages/skills-package-manager/skills.schema.json')
  await writeFile(pkgOutputPath, JSON.stringify(output, null, 2) + '\n')
  console.log(`✅ Generated JSON Schema (package): ${pkgOutputPath}`)
}

main().catch((error) => {
  console.error('❌ Failed to generate schema:', error)
  process.exit(1)
})

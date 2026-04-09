/**
 * Script to generate JSON Schema from Zod schema
 * Run with: pnpm tsx packages/skills-package-manager/scripts/generate-schema.ts
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { skillsManifestSchema } from '../src/config/schema'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

async function main() {
  // Use Zod v4 native JSON Schema generation
  const jsonSchema = z.toJSONSchema(skillsManifestSchema, {
    name: 'skillsManifest',
  })

  // Add $schema field for JSON Schema draft
  const output = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...jsonSchema,
  }

  // Generate in package directory (for npm publishing)
  const pkgOutputPath = path.join(rootDir, 'skills.schema.json')
  await writeFile(pkgOutputPath, JSON.stringify(output, null, 2) + '\n')
  console.log(`✅ Generated JSON Schema (package): ${pkgOutputPath}`)
}

main().catch((error) => {
  console.error('❌ Failed to generate schema:', error)
  process.exit(1)
})

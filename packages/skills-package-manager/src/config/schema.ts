import { z } from 'zod'

/**
 * Zod schema for skills.json manifest validation
 * This is the single source of truth for the manifest structure
 */
export const skillsManifestSchema = z
  .object({
    $schema: z.string().optional().describe('JSON Schema URL for editor autocompletion'),
    installDir: z
      .string()
      .default('.agents/skills')
      .describe('Directory where skills will be installed'),
    linkTargets: z
      .array(z.string())
      .default([])
      .describe('Directories where skill symlinks will be created'),
    selfSkill: z.boolean().optional().describe('Whether this project is itself a skill'),
    pnpmPlugin: z
      .object({
        removePnpmfileChecksum: z
          .boolean()
          .optional()
          .describe(
            'Temporarily remove pnpmfileChecksum from pnpm lockfiles in pnpm-plugin-skills afterAllResolved',
          ),
      })
      .optional()
      .describe('pnpm-plugin-skills specific compatibility settings'),
    skills: z
      .record(z.string(), z.string())
      .default({})
      .describe('Map of skill names to their specifiers'),
  })
  .strict()

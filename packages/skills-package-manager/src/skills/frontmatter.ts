import { parse as parseYaml } from 'yaml'

export type ParsedSkillFrontmatter = {
  name: string
  description: string
  dependencies: Record<string, string>
}

export type FrontmatterWarning = {
  code: 'invalid-frontmatter' | 'invalid-dependencies'
  message: string
  dependencyName?: string
  specifier?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractFrontmatter(content: string): string | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  return match?.[1] ?? null
}

export function parseSkillFrontmatter(content: string): {
  frontmatter: ParsedSkillFrontmatter
  warnings: FrontmatterWarning[]
} {
  const warnings: FrontmatterWarning[] = []
  const empty: ParsedSkillFrontmatter = {
    name: '',
    description: '',
    dependencies: {},
  }

  const rawFrontmatter = extractFrontmatter(content)
  if (!rawFrontmatter) {
    return { frontmatter: empty, warnings }
  }

  let parsed: unknown
  try {
    parsed = parseYaml(rawFrontmatter)
  } catch (error) {
    warnings.push({
      code: 'invalid-frontmatter',
      message: `Invalid SKILL.md frontmatter: ${(error as Error).message}`,
    })
    return { frontmatter: empty, warnings }
  }

  if (!isRecord(parsed)) {
    return { frontmatter: empty, warnings }
  }

  const dependencies: Record<string, string> = {}
  const rawDependencies = parsed.dependencies
  if (rawDependencies !== undefined) {
    if (!isRecord(rawDependencies)) {
      warnings.push({
        code: 'invalid-dependencies',
        message: 'SKILL.md frontmatter dependencies must be a map of skill names to specifiers',
      })
    } else {
      for (const [dependencyName, specifier] of Object.entries(rawDependencies)) {
        if (!dependencyName.trim() || typeof specifier !== 'string') {
          warnings.push({
            code: 'invalid-dependencies',
            message: `Invalid dependency "${dependencyName}": dependencies must map skill names to string specifiers`,
            dependencyName,
            specifier: typeof specifier === 'string' ? specifier : undefined,
          })
          continue
        }

        dependencies[dependencyName] = specifier
      }
    }
  }

  return {
    frontmatter: {
      name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
      description: typeof parsed.description === 'string' ? parsed.description.trim() : '',
      dependencies,
    },
    warnings,
  }
}

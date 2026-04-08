import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export function createSkillPackage(skillName: string, content: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-package-'))
  mkdirSync(path.join(root, 'skills', skillName), { recursive: true })
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(
      {
        name: `@tests/${skillName}`,
        version: '1.0.0',
      },
      null,
      2,
    ),
  )
  writeFileSync(path.join(root, 'skills', skillName, 'SKILL.md'), content)
  return root
}

export function packDirectory(packageRoot: string): string {
  const output = execSync('npm pack --json', { cwd: packageRoot }).toString().trim()
  const [{ filename }] = JSON.parse(output) as Array<{ filename: string }>
  return path.join(packageRoot, filename)
}

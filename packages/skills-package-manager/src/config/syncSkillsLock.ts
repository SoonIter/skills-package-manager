import type { SkillsLock, SkillsLockEntry, SkillsManifest } from './types'
import { normalizeSpecifier } from '../specifiers/normalizeSpecifier'
import { sha256 } from '../utils/hash'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function resolveGitCommit(url: string, ref: string | null): Promise<string> {
  const target = ref ?? 'HEAD'
  const { stdout } = await execFileAsync('git', ['ls-remote', url, target])
  const line = stdout.trim().split('\n')[0]
  const commit = line?.split('\t')[0]?.trim()

  if (!commit) {
    throw new Error(`Unable to resolve git ref ${target} for ${url}`)
  }

  return commit
}

export async function resolveLockEntry(cwd: string, specifier: string): Promise<{ skillName: string; entry: SkillsLockEntry }> {
  const normalized = normalizeSpecifier(specifier)

  if (normalized.type === 'file') {
    const sourceRoot = path.resolve(cwd, normalized.source.slice('file:'.length))
    return {
      skillName: normalized.skillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'file',
          path: sourceRoot,
        },
        digest: sha256(`${sourceRoot}:${normalized.path}`),
      },
    }
  }

  if (normalized.type === 'git') {
    const commit = await resolveGitCommit(normalized.source, normalized.ref)
    return {
      skillName: normalized.skillName,
      entry: {
        specifier: normalized.normalized,
        resolution: {
          type: 'git',
          url: normalized.source,
          commit,
          path: normalized.path,
        },
        digest: sha256(`${normalized.source}:${commit}:${normalized.path}`),
      },
    }
  }

  throw new Error(`Unsupported specifier type in 0.1.0 core flow: ${normalized.type}`)
}

export async function syncSkillsLock(cwd: string, manifest: SkillsManifest, existingLock: SkillsLock | null): Promise<SkillsLock> {
  const nextSkills: Record<string, SkillsLockEntry> = {}

  for (const specifier of Object.values(manifest.skills)) {
    const { skillName, entry } = await resolveLockEntry(cwd, specifier)
    nextSkills[skillName] = entry
  }

  return {
    lockfileVersion: '0.1',
    installDir: manifest.installDir ?? '.agents/skills',
    linkTargets: manifest.linkTargets ?? [],
    skills: nextSkills,
  }
}

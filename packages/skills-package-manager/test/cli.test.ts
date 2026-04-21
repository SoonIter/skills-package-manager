import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from '@rstest/core'
import packageJson from '../package.json'
import { runCli } from '../src/cli/runCli'
import { writeSkillsLock } from '../src/config/writeSkillsLock'
import { writeSkillsManifest } from '../src/config/writeSkillsManifest'
import { createSkillPackage, packDirectory } from './helpers'

async function captureOutput<TResult>(callback: () => Promise<TResult>) {
  const output: string[] = []
  const info = console.info
  const error = console.error

  console.info = (...args: unknown[]) => {
    output.push(args.map((arg) => String(arg)).join(' '))
  }

  console.error = (...args: unknown[]) => {
    output.push(args.map((arg) => String(arg)).join(' '))
  }

  try {
    const result = await callback()
    return { output: output.join('\n'), result }
  } finally {
    console.info = info
    console.error = error
  }
}

function createAsyncSpy<TArgs extends unknown[], TResult>(result: TResult) {
  const calls: TArgs[] = []

  return {
    calls,
    fn: async (...args: TArgs): Promise<TResult> => {
      calls.push(args)
      return result
    },
  }
}

function withHandlers<THandlers extends object>(handlers: THandlers) {
  return { handlers } as { handlers: THandlers }
}

describe('runCli dispatch', () => {
  it('dispatches add with specifier only', async () => {
    const add = createAsyncSpy<
      [
        options: {
          cwd: string
          specifier: string
          skill?: string
          global?: boolean
          yes?: boolean
          agent?: string[]
        },
      ],
      string
    >('added')

    const result = await runCli(['node', 'spm', 'add', 'github:owner/repo'], {
      cwd: '/workspace/project',
      ...withHandlers({ addCommand: add.fn }),
    })

    expect(result).toBe('added')
    expect(add.calls).toEqual([
      [
        {
          cwd: '/workspace/project',
          specifier: 'github:owner/repo',
          skill: undefined,
          global: undefined,
          yes: undefined,
          agent: undefined,
        },
      ],
    ])
  })

  it('dispatches add with optional --skill', async () => {
    const add = createAsyncSpy<
      [
        options: {
          cwd: string
          specifier: string
          skill?: string
          global?: boolean
          yes?: boolean
          agent?: string[]
        },
      ],
      string
    >('added')

    await runCli(['node', 'spm', 'add', 'owner/repo', '--skill', 'my-skill'], {
      cwd: '/workspace/project',
      ...withHandlers({ addCommand: add.fn }),
    })

    expect(add.calls).toEqual([
      [
        {
          cwd: '/workspace/project',
          specifier: 'owner/repo',
          skill: 'my-skill',
          global: undefined,
          yes: undefined,
          agent: undefined,
        },
      ],
    ])
  })

  it('dispatches add with -g -y and repeated --agent', async () => {
    const add = createAsyncSpy<
      [
        options: {
          cwd: string
          specifier: string
          skill?: string
          global?: boolean
          yes?: boolean
          agent?: string[]
        },
      ],
      string
    >('added')

    await runCli(
      [
        'node',
        'spm',
        'add',
        'owner/repo',
        '--agent',
        'claude-code',
        '--agent',
        'continue',
        '-g',
        '-y',
      ],
      {
        cwd: '/workspace/project',
        ...withHandlers({ addCommand: add.fn }),
      },
    )

    expect(add.calls).toEqual([
      [
        {
          cwd: '/workspace/project',
          specifier: 'owner/repo',
          skill: undefined,
          global: true,
          yes: true,
          agent: ['claude-code', 'continue'],
        },
      ],
    ])
  })

  it('dispatches install with cwd', async () => {
    const install = createAsyncSpy<[options: { cwd: string }], string>('installed')

    const result = await runCli(['node', 'spm', 'install'], {
      cwd: '/workspace/project',
      ...withHandlers({ installCommand: install.fn }),
    })

    expect(result).toBe('installed')
    expect(install.calls).toEqual([[{ cwd: '/workspace/project' }]])
  })

  it('dispatches patch with optional flags', async () => {
    const patch = createAsyncSpy<
      [options: { cwd: string; skillName: string; editDir?: string; ignoreExisting?: boolean }],
      string
    >('patched')

    await runCli(
      ['node', 'spm', 'patch', 'alpha', '--edit-dir', './tmp/alpha', '--ignore-existing'],
      {
        cwd: '/workspace/project',
        ...withHandlers({ patchCommand: patch.fn }),
      },
    )

    expect(patch.calls).toEqual([
      [
        {
          cwd: '/workspace/project',
          skillName: 'alpha',
          editDir: './tmp/alpha',
          ignoreExisting: true,
        },
      ],
    ])
  })

  it('dispatches patch-commit with an optional patches dir', async () => {
    const patchCommit = createAsyncSpy<
      [options: { cwd: string; editDir: string; patchesDir?: string }],
      string
    >('patched')

    await runCli(
      ['node', 'spm', 'patch-commit', './tmp/alpha', '--patches-dir', './patches/custom'],
      {
        cwd: '/workspace/project',
        ...withHandlers({ patchCommitCommand: patchCommit.fn }),
      },
    )

    expect(patchCommit.calls).toEqual([
      [
        {
          cwd: '/workspace/project',
          editDir: './tmp/alpha',
          patchesDir: './patches/custom',
        },
      ],
    ])
  })

  it('dispatches update with skills array', async () => {
    const update = createAsyncSpy<[options: { cwd: string; skills?: string[] }], string>('updated')

    await runCli(['node', 'spm', 'update', 'alpha', 'beta'], {
      cwd: '/workspace/project',
      ...withHandlers({ updateCommand: update.fn }),
    })

    expect(update.calls).toEqual([[{ cwd: '/workspace/project', skills: ['alpha', 'beta'] }]])
  })

  it('dispatches update with undefined skills when no args are passed', async () => {
    const update = createAsyncSpy<[options: { cwd: string; skills?: string[] }], string>('updated')

    await runCli(['node', 'spm', 'update'], {
      cwd: '/workspace/project',
      ...withHandlers({ updateCommand: update.fn }),
    })

    expect(update.calls).toEqual([[{ cwd: '/workspace/project', skills: undefined }]])
  })

  it('dispatches init with yes true when --yes is passed', async () => {
    const init = createAsyncSpy<[options: { cwd: string; yes?: boolean }], string>('initialized')

    const result = await runCli(['node', 'spm', 'init', '--yes'], {
      cwd: '/workspace/project',
      ...withHandlers({ initCommand: init.fn }),
    })

    expect(result).toBe('initialized')
    expect(init.calls).toEqual([[{ cwd: '/workspace/project', yes: true }]])
  })

  it('shows top-level help when no command is provided', async () => {
    const { output, result } = await captureOutput(() =>
      runCli(['node', 'spm'], { cwd: '/workspace/project' }),
    )

    expect(result).toBeUndefined()
    expect(output).toContain('Usage:')
    expect(output).toContain('spm')
  })

  it('prints the package version for --version', async () => {
    const { output, result } = await captureOutput(() =>
      runCli(['node', 'spm', '--version'], { cwd: '/workspace/project' }),
    )

    expect(result).toBeUndefined()
    expect(output.trim()).toBe(packageJson.version)
  })

  it('prints install progress summary in non-tty mode', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-cli-progress-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
    const tarballPath = packDirectory(packageRoot)
    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
      },
    })
    await writeSkillsLock(root, {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': {
          specifier: `file:${tarballPath}#path:/skills/hello-skill`,
          resolution: {
            type: 'file',
            tarball: path.relative(root, tarballPath),
            path: '/skills/hello-skill',
          },
          digest: 'test-digest',
        },
      },
    })

    const output: string[] = []
    const info = console.info
    const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')

    console.info = (...args: unknown[]) => {
      output.push(args.map((arg) => String(arg)).join(' '))
    }

    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true })

    try {
      await runCli(['node', 'spm', 'install'], { cwd: root })
    } finally {
      console.info = info
      if (isTTYDescriptor) {
        Object.defineProperty(process.stderr, 'isTTY', isTTYDescriptor)
      } else {
        delete (process.stderr as { isTTY?: boolean }).isTTY
      }
    }

    const combined = output.join('\n')
    expect(combined).toContain('spm install: starting (1 skill)')
    expect(combined).toContain(
      'spm install: Progress: resolved 1, reused 0, downloaded 0, added 1, done',
    )
    expect(combined).not.toContain('\r')
  })

  it('renders dynamic progress line in tty mode', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'skills-pm-cli-progress-tty-'))
    const packageRoot = createSkillPackage('hello-skill', '# Hello from tgz\n')
    const tarballPath = packDirectory(packageRoot)
    await writeSkillsManifest(root, {
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': `file:${tarballPath}#path:/skills/hello-skill`,
      },
    })
    await writeSkillsLock(root, {
      lockfileVersion: '0.1',
      installDir: '.agents/skills',
      linkTargets: [],
      skills: {
        'hello-skill': {
          specifier: `file:${tarballPath}#path:/skills/hello-skill`,
          resolution: {
            type: 'file',
            tarball: path.relative(root, tarballPath),
            path: '/skills/hello-skill',
          },
          digest: 'test-digest',
        },
      },
    })

    const writes: string[] = []
    const infos: string[] = []
    const info = console.info
    const originalWrite = process.stderr.write.bind(process.stderr)
    const isTTYDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')

    console.info = (...args: unknown[]) => {
      infos.push(args.map((arg) => String(arg)).join(' '))
    }

    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true })
    ;(process.stderr.write as unknown as (chunk: string) => boolean) = (chunk: string) => {
      writes.push(String(chunk))
      return true
    }

    try {
      await runCli(['node', 'spm', 'install'], { cwd: root })
    } finally {
      console.info = info
      ;(process.stderr.write as unknown as typeof process.stderr.write) = originalWrite
      if (isTTYDescriptor) {
        Object.defineProperty(process.stderr, 'isTTY', isTTYDescriptor)
      } else {
        delete (process.stderr as { isTTY?: boolean }).isTTY
      }
    }

    const combinedWrites = writes.join('')
    expect(combinedWrites).toContain('\r')
    expect(combinedWrites).toContain('Progress: resolved 1, reused 0, downloaded 0, added 1, done')
    expect(infos).toHaveLength(0)
  })
})

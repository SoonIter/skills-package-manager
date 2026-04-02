import { describe, expect, it } from '@rstest/core'
import packageJson from '../package.json'
import { runCli } from '../src/cli/runCli'

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
  }
  finally {
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
    const add = createAsyncSpy<[options: { cwd: string; specifier: string; skill?: string }], string>('added')

    const result = await runCli(['node', 'spm', 'add', 'github:owner/repo'], {
      cwd: '/workspace/project',
      ...withHandlers({ addCommand: add.fn }),
    })

    expect(result).toBe('added')
    expect(add.calls).toEqual([[{ cwd: '/workspace/project', specifier: 'github:owner/repo', skill: undefined }]])
  })

  it('dispatches add with optional --skill', async () => {
    const add = createAsyncSpy<[options: { cwd: string; specifier: string; skill?: string }], string>('added')

    await runCli(['node', 'spm', 'add', 'owner/repo', '--skill', 'my-skill'], {
      cwd: '/workspace/project',
      ...withHandlers({ addCommand: add.fn }),
    })

    expect(add.calls).toEqual([[{ cwd: '/workspace/project', specifier: 'owner/repo', skill: 'my-skill' }]])
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
    const { output, result } = await captureOutput(() => runCli(['node', 'spm'], { cwd: '/workspace/project' }))

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
})

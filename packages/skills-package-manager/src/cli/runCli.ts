import { addCommand } from '../commands/add'
import { initCommand } from '../commands/init'
import { installCommand } from '../commands/install'
import { updateCommand } from '../commands/update'

function parseArgs(args: string[]): {
  positionals: string[]
  flags: Record<string, string>
  flagsWithValues: Set<string>
} {
  const positionals: string[] = []
  const flags: Record<string, string> = {}
  const flagsWithValues = new Set<string>()

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        flagsWithValues.add(key)
        i++
      } else {
        flags[key] = 'true'
      }
    } else {
      positionals.push(arg)
    }
  }

  return { positionals, flags, flagsWithValues }
}

export async function runCli(argv: string[], context?: { cwd?: string }) {
  const [, , command, ...rest] = argv
  const cwd = context?.cwd ?? process.cwd()

  if (command === 'add') {
    const { positionals, flags } = parseArgs(rest)
    const specifier = positionals[0]
    if (!specifier) {
      throw new Error('Missing required specifier')
    }
    return addCommand({ cwd, specifier, skill: flags.skill })
  }

  if (command === 'install') {
    return installCommand({ cwd })
  }

  if (command === 'update') {
    const { positionals } = parseArgs(rest)
    return updateCommand({ cwd, skills: positionals.length > 0 ? positionals : undefined })
  }

  if (command === 'init') {
    const { positionals, flags, flagsWithValues } = parseArgs(rest)

    if (positionals.length > 0) {
      throw new Error('init does not accept positional arguments')
    }

    for (const key of Object.keys(flags)) {
      if (key !== 'yes') {
        throw new Error(`Unknown flag for init: --${key}`)
      }

      if (flagsWithValues.has(key)) {
        throw new Error('init --yes does not accept a value')
      }
    }

    return initCommand({ cwd, yes: 'yes' in flags })
  }

  throw new Error(`Unknown command: ${command}`)
}

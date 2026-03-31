import { addCommand } from '../commands/add'
import { installCommand } from '../commands/install'

function parseArgs(args: string[]): { positionals: string[]; flags: Record<string, string> } {
  const positionals: string[] = []
  const flags: Record<string, string> = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = 'true'
      }
    } else {
      positionals.push(arg)
    }
  }

  return { positionals, flags }
}

export async function runCli(argv: string[]) {
  const [, , command, ...rest] = argv
  const cwd = process.cwd()

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

  throw new Error(`Unknown command: ${command}`)
}

import { addCommand } from '../commands/add'
import { installCommand } from '../commands/install'

export async function runCli(argv: string[]) {
  const [, , command, ...rest] = argv
  const cwd = process.cwd()

  if (command === 'add') {
    const specifier = rest[0]
    if (!specifier) {
      throw new Error('Missing required specifier')
    }
    return addCommand({ cwd, specifier })
  }

  if (command === 'install') {
    return installCommand({ cwd })
  }

  throw new Error(`Unknown command: ${command}`)
}

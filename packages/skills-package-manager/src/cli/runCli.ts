import { cac } from 'cac'
import packageJson from '../../package.json'
import { addCommand } from '../commands/add'
import { initCommand } from '../commands/init'
import { installCommand } from '../commands/install'
import { updateCommand } from '../commands/update'

type CliHandlers = {
  addCommand: typeof addCommand
  installCommand: typeof installCommand
  updateCommand: typeof updateCommand
  initCommand: typeof initCommand
}

type InternalRunCliContext = {
  cwd?: string
  handlers?: Partial<CliHandlers>
}

function createHandlers(overrides?: Partial<CliHandlers>): CliHandlers {
  return {
    addCommand,
    installCommand,
    updateCommand,
    initCommand,
    ...overrides,
  }
}

function formatFlagName(name: string): string {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
}

const packageVersion = packageJson.version

export function runCli(argv: string[], context?: { cwd?: string }): Promise<unknown>
export async function runCli(argv: string[], context: InternalRunCliContext = {}) {
  const cwd = context.cwd ?? process.cwd()
  const handlers = createHandlers(context.handlers)
  const cli = cac('spm')

  cli.help()
  cli.version(packageVersion)
  cli.showVersionOnExit = false

  cli
    .command('add [...positionals]')
    .option('--skill <name>', 'Select a skill')
    .action((positionals: string[] = [], options: { skill?: string }) => {
      const specifier = positionals[0]
      if (!specifier) {
        throw new Error('Missing required specifier')
      }

      return handlers.addCommand({ cwd, specifier, skill: options.skill })
    })

  cli
    .command('install [...args]')
    .option('--frozen-lockfile', 'Fail if lockfile is out of sync')
    .action((_args: string[], options: { frozenLockfile?: boolean }) => {
      return handlers.installCommand({ cwd, frozenLockfile: options.frozenLockfile })
    })

  cli.command('update [...skills]').action((skills: string[] = []) => {
    return handlers.updateCommand({ cwd, skills: skills.length > 0 ? skills : undefined })
  })

  cli
    .command('init [...args]', '', { allowUnknownOptions: true })
    .option('--yes [value]', 'Skip prompts and write defaults')
    .action((args: string[] = [], options: { yes?: boolean | string; '--'?: string[]; [key: string]: unknown }) => {
      if (args.length > 0) {
        throw new Error('init does not accept positional arguments')
      }

      for (const key of Object.keys(options)) {
        if (key === '--') {
          continue
        }

        if (key !== 'yes') {
          throw new Error(`Unknown flag for init: --${formatFlagName(key)}`)
        }
      }

      if (typeof options.yes === 'string') {
        throw new Error('init --yes does not accept a value')
      }

      return handlers.initCommand({ cwd, yes: options.yes === true })
    })

  cli.parse(argv, { run: false })

  const globalOptions = cli.options as {
    help?: boolean
    h?: boolean
    version?: boolean
    v?: boolean
  }

  if (globalOptions.version || globalOptions.v) {
    console.info(packageVersion)
    return
  }

  if (argv.length <= 2) {
    cli.outputHelp()
    return
  }

  if (globalOptions.help || globalOptions.h) {
    return
  }

  if (!cli.matchedCommand) {
    throw new Error(`Unknown command: ${argv[2]}`)
  }

  return cli.runMatchedCommand()
}

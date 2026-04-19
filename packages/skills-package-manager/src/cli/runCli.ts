import { cac } from 'cac'
import packageJson from '../../package.json'
import { addCommand } from '../commands/add'
import { initCommand } from '../commands/init'
import { installCommand } from '../commands/install'
import { patchCommand } from '../commands/patch'
import { patchCommitCommand } from '../commands/patchCommit'
import { updateCommand } from '../commands/update'
import { formatErrorForDisplay, SpmError } from '../errors'

type CliHandlers = {
  addCommand: typeof addCommand
  installCommand: typeof installCommand
  patchCommitCommand: typeof patchCommitCommand
  patchCommand: typeof patchCommand
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
    patchCommitCommand,
    patchCommand,
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
    .option('-a, --agent <name>', 'Target agent')
    .option('-g, --global', 'Install into the global skills workspace')
    .option('--skill <name>', 'Select a skill')
    .option('-y, --yes', 'Skip prompts and select defaults')
    .action(
      async (
        positionals: string[] = [],
        options: { agent?: string[] | string; global?: boolean; skill?: string; yes?: boolean },
      ) => {
        const specifier = positionals[0]
        if (!specifier) {
          throw new Error('Missing required specifier')
        }

        const agent = Array.isArray(options.agent)
          ? options.agent
          : options.agent
            ? [options.agent]
            : undefined

        return handlers.addCommand({
          cwd,
          specifier,
          skill: options.skill,
          global: options.global,
          yes: options.yes,
          agent,
        })
      },
    )

  cli
    .command('install [...args]')
    .option('--frozen-lockfile', 'Fail if lockfile is out of sync')
    .action(async (_args: string[], options: { frozenLockfile?: boolean }) => {
      return handlers.installCommand({ cwd, frozenLockfile: options.frozenLockfile })
    })

  cli
    .command('patch <skill>')
    .option('--edit-dir <dir>', 'Directory to extract the editable skill into')
    .option('--ignore-existing', 'Ignore an existing committed patch while preparing the edit dir')
    .action(async (skill: string, options: { editDir?: string; ignoreExisting?: boolean }) => {
      return handlers.patchCommand({
        cwd,
        skillName: skill,
        editDir: options.editDir,
        ignoreExisting: options.ignoreExisting,
      })
    })

  cli
    .command('patch-commit <editDir>')
    .option('--patches-dir <dir>', 'Directory to save the generated patch file into')
    .action(async (editDir: string, options: { patchesDir?: string }) => {
      return handlers.patchCommitCommand({ cwd, editDir, patchesDir: options.patchesDir })
    })

  cli.command('update [...skills]').action(async (skills: string[] = []) => {
    return handlers.updateCommand({ cwd, skills: skills.length > 0 ? skills : undefined })
  })

  cli
    .command('init [...args]', '', { allowUnknownOptions: true })
    .option('--yes [value]', 'Skip prompts and write defaults')
    .action(
      async (
        args: string[] = [],
        options: { yes?: boolean | string; '--'?: string[]; [key: string]: unknown },
      ) => {
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
      },
    )

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

  try {
    return await cli.runMatchedCommand()
  } catch (error) {
    // Enhance SPM errors with formatted output
    if (error instanceof SpmError) {
      // Create a new error with the formatted message for better CLI output
      const enhancedError = new Error(formatErrorForDisplay(error))
      // Preserve the original error as cause if possible
      throw enhancedError
    }
    throw error
  }
}

import { cac } from 'cac'
import packageJson from '../../package.json'
import { addCommand } from '../commands/add'
import { initCommand } from '../commands/init'
import { installCommand } from '../commands/install'
import { patchCommand } from '../commands/patch'
import { patchCommitCommand } from '../commands/patchCommit'
import { updateCommand } from '../commands/update'
import type { SkillDependencyWarning } from '../config/types'
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

function collectOptionValues(argv: string[], optionNames: string[]): string[] | undefined {
  const values: string[] = []

  for (let index = 3; index < argv.length; index += 1) {
    const token = argv[index]
    const equalsName = optionNames.find((name) => token.startsWith(`${name}=`))
    if (equalsName) {
      const value = token.slice(equalsName.length + 1)
      if (value) {
        values.push(value)
      }
      continue
    }

    const shortName = optionNames.find(
      (name) =>
        name.startsWith('-') && !name.startsWith('--') && token.startsWith(name) && token !== name,
    )
    if (shortName) {
      values.push(token.slice(shortName.length))
      continue
    }

    if (!optionNames.includes(token)) {
      continue
    }

    while (index + 1 < argv.length && !argv[index + 1].startsWith('-')) {
      values.push(argv[index + 1])
      index += 1
    }
  }

  return values.length > 0 ? values : undefined
}

function toSingleOrArray(values: string[] | undefined, fallback?: string[] | string) {
  if (!values) {
    return fallback
  }

  return values.length === 1 ? values[0] : values
}

const packageVersion = packageJson.version

function printSkillDependencyWarning(warning: SkillDependencyWarning) {
  console.warn(`spm warning: ${warning.message}`)
}

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
    .option('-s, --skill <name>', 'Select a skill')
    .option('-l, --list', 'List available skills without installing')
    .option('--copy', 'Accept skills CLI copy-mode flag')
    .option('--all', 'Install all discovered skills to all known project agents')
    .option('-y, --yes', 'Skip prompts and select defaults')
    .action(
      async (
        positionals: string[] = [],
        options: {
          agent?: string[] | string
          global?: boolean
          skill?: string[] | string
          list?: boolean
          copy?: boolean
          all?: boolean
          yes?: boolean
        },
      ) => {
        const specifier = positionals[0]
        if (!specifier) {
          throw new Error('Missing required specifier')
        }

        const collectedAgents = collectOptionValues(argv, ['-a', '--agent'])
        const agent = collectedAgents
          ? collectedAgents
          : Array.isArray(options.agent)
            ? options.agent
            : options.agent
              ? [options.agent]
              : undefined
        const skill = toSingleOrArray(collectOptionValues(argv, ['-s', '--skill']), options.skill)

        return handlers.addCommand({
          cwd,
          specifier,
          skill,
          global: options.global,
          yes: options.yes,
          agent,
          list: options.list,
          copy: options.copy,
          all: options.all,
        })
      },
    )

  cli.command('install [...args]').action(async () => {
    return handlers.installCommand({ cwd, onWarning: printSkillDependencyWarning })
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
    return handlers.updateCommand({
      cwd,
      skills: skills.length > 0 ? skills : undefined,
      onWarning: printSkillDependencyWarning,
    })
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

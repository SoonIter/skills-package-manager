import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

type CompatibleAgentTarget = {
  displayName: string
  projectPath: string
  globalPath: () => string
}

function getHomeDir(): string {
  return homedir()
}

function getConfigHome(): string {
  return process.env.XDG_CONFIG_HOME?.trim() || path.join(getHomeDir(), '.config')
}

function getCodexHome(): string {
  return process.env.CODEX_HOME?.trim() || path.join(getHomeDir(), '.codex')
}

function getClaudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(getHomeDir(), '.claude')
}

function getOpenClawGlobalSkillsDir(homeDir = getHomeDir()): string {
  if (existsSync(path.join(homeDir, '.openclaw'))) {
    return path.join(homeDir, '.openclaw/skills')
  }

  if (existsSync(path.join(homeDir, '.clawdbot'))) {
    return path.join(homeDir, '.clawdbot/skills')
  }

  if (existsSync(path.join(homeDir, '.moltbot'))) {
    return path.join(homeDir, '.moltbot/skills')
  }

  return path.join(homeDir, '.openclaw/skills')
}

const COMPATIBLE_ADD_AGENTS: Record<string, CompatibleAgentTarget> = {
  adal: {
    displayName: 'Adal',
    projectPath: '.adal/skills',
    globalPath: () => path.join(getHomeDir(), '.adal/skills'),
  },
  amp: {
    displayName: 'Amp',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getConfigHome(), 'agents/skills'),
  },
  antigravity: {
    displayName: 'Antigravity',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.gemini/antigravity/skills'),
  },
  augment: {
    displayName: 'Augment',
    projectPath: '.augment/skills',
    globalPath: () => path.join(getHomeDir(), '.augment/skills'),
  },
  bob: {
    displayName: 'IBM Bob',
    projectPath: '.bob/skills',
    globalPath: () => path.join(getHomeDir(), '.bob/skills'),
  },
  'claude-code': {
    displayName: 'Claude Code',
    projectPath: '.claude/skills',
    globalPath: () => path.join(getClaudeHome(), 'skills'),
  },
  cline: {
    displayName: 'Cline',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.agents/skills'),
  },
  codebuddy: {
    displayName: 'CodeBuddy',
    projectPath: '.codebuddy/skills',
    globalPath: () => path.join(getHomeDir(), '.codebuddy/skills'),
  },
  codex: {
    displayName: 'Codex',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getCodexHome(), 'skills'),
  },
  'command-code': {
    displayName: 'Command Code',
    projectPath: '.commandcode/skills',
    globalPath: () => path.join(getHomeDir(), '.commandcode/skills'),
  },
  continue: {
    displayName: 'Continue',
    projectPath: '.continue/skills',
    globalPath: () => path.join(getHomeDir(), '.continue/skills'),
  },
  cortex: {
    displayName: 'Cortex Code',
    projectPath: '.cortex/skills',
    globalPath: () => path.join(getHomeDir(), '.snowflake/cortex/skills'),
  },
  crush: {
    displayName: 'Crush',
    projectPath: '.crush/skills',
    globalPath: () => path.join(getHomeDir(), '.config/crush/skills'),
  },
  cursor: {
    displayName: 'Cursor',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.cursor/skills'),
  },
  deepagents: {
    displayName: 'Deep Agents',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.deepagents/agent/skills'),
  },
  droid: {
    displayName: 'Droid',
    projectPath: '.factory/skills',
    globalPath: () => path.join(getHomeDir(), '.factory/skills'),
  },
  firebender: {
    displayName: 'Firebender',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.firebender/skills'),
  },
  'gemini-cli': {
    displayName: 'Gemini CLI',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.gemini/skills'),
  },
  'github-copilot': {
    displayName: 'GitHub Copilot',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.copilot/skills'),
  },
  goose: {
    displayName: 'Goose',
    projectPath: '.goose/skills',
    globalPath: () => path.join(getConfigHome(), 'goose/skills'),
  },
  'iflow-cli': {
    displayName: 'iFlow CLI',
    projectPath: '.iflow/skills',
    globalPath: () => path.join(getHomeDir(), '.iflow/skills'),
  },
  junie: {
    displayName: 'Junie',
    projectPath: '.junie/skills',
    globalPath: () => path.join(getHomeDir(), '.junie/skills'),
  },
  kilo: {
    displayName: 'Kilo Code',
    projectPath: '.kilocode/skills',
    globalPath: () => path.join(getHomeDir(), '.kilocode/skills'),
  },
  'kimi-cli': {
    displayName: 'Kimi Code CLI',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.config/agents/skills'),
  },
  'kiro-cli': {
    displayName: 'Kiro CLI',
    projectPath: '.kiro/skills',
    globalPath: () => path.join(getHomeDir(), '.kiro/skills'),
  },
  kode: {
    displayName: 'Kode',
    projectPath: '.kode/skills',
    globalPath: () => path.join(getHomeDir(), '.kode/skills'),
  },
  mcpjam: {
    displayName: 'MCPJam',
    projectPath: '.mcpjam/skills',
    globalPath: () => path.join(getHomeDir(), '.mcpjam/skills'),
  },
  'mistral-vibe': {
    displayName: 'Mistral Vibe',
    projectPath: '.vibe/skills',
    globalPath: () => path.join(getHomeDir(), '.vibe/skills'),
  },
  mux: {
    displayName: 'Mux',
    projectPath: '.mux/skills',
    globalPath: () => path.join(getHomeDir(), '.mux/skills'),
  },
  neovate: {
    displayName: 'Neovate',
    projectPath: '.neovate/skills',
    globalPath: () => path.join(getHomeDir(), '.neovate/skills'),
  },
  opencode: {
    displayName: 'OpenCode',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getConfigHome(), 'opencode/skills'),
  },
  openclaw: {
    displayName: 'OpenClaw',
    projectPath: 'skills',
    globalPath: () => getOpenClawGlobalSkillsDir(),
  },
  openhands: {
    displayName: 'OpenHands',
    projectPath: '.openhands/skills',
    globalPath: () => path.join(getHomeDir(), '.openhands/skills'),
  },
  pi: {
    displayName: 'PI',
    projectPath: '.pi/skills',
    globalPath: () => path.join(getHomeDir(), '.pi/agent/skills'),
  },
  pochi: {
    displayName: 'Pochi',
    projectPath: '.pochi/skills',
    globalPath: () => path.join(getHomeDir(), '.pochi/skills'),
  },
  qoder: {
    displayName: 'Qoder',
    projectPath: '.qoder/skills',
    globalPath: () => path.join(getHomeDir(), '.qoder/skills'),
  },
  'qwen-code': {
    displayName: 'Qwen Code',
    projectPath: '.qwen/skills',
    globalPath: () => path.join(getHomeDir(), '.qwen/skills'),
  },
  replit: {
    displayName: 'Replit',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getConfigHome(), 'agents/skills'),
  },
  roo: {
    displayName: 'Roo',
    projectPath: '.roo/skills',
    globalPath: () => path.join(getHomeDir(), '.roo/skills'),
  },
  trae: {
    displayName: 'Trae',
    projectPath: '.trae/skills',
    globalPath: () => path.join(getHomeDir(), '.trae/skills'),
  },
  'trae-cn': {
    displayName: 'Trae CN',
    projectPath: '.trae/skills',
    globalPath: () => path.join(getHomeDir(), '.trae-cn/skills'),
  },
  universal: {
    displayName: 'Universal',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getConfigHome(), 'agents/skills'),
  },
  warp: {
    displayName: 'Warp',
    projectPath: '.agents/skills',
    globalPath: () => path.join(getHomeDir(), '.agents/skills'),
  },
  windsurf: {
    displayName: 'Windsurf',
    projectPath: '.windsurf/skills',
    globalPath: () => path.join(getHomeDir(), '.codeium/windsurf/skills'),
  },
  zencoder: {
    displayName: 'Zencoder',
    projectPath: '.zencoder/skills',
    globalPath: () => path.join(getHomeDir(), '.zencoder/skills'),
  },
} as const

function dedupePreserveOrder(values: string[]): string[] {
  return [...new Set(values)]
}

export function listCompatibleAddAgentNames(): string[] {
  return Object.keys(COMPATIBLE_ADD_AGENTS).sort()
}

export function getCompatibleAddAgent(name: string): CompatibleAgentTarget | null {
  return COMPATIBLE_ADD_AGENTS[name] ?? null
}

export function resolveCompatibleAddAgentTargets(
  agentNames: string[] | undefined,
  options: { global: boolean; installDir?: string },
): { invalidAgents: string[]; linkTargets: string[] } {
  if (!agentNames || agentNames.length === 0) {
    return { invalidAgents: [], linkTargets: [] }
  }

  const expandedAgentNames = agentNames.includes('*') ? listCompatibleAddAgentNames() : agentNames
  const linkTargets: string[] = []
  const invalidAgents: string[] = []

  for (const agentName of dedupePreserveOrder(expandedAgentNames)) {
    const target = getCompatibleAddAgent(agentName)
    if (!target) {
      invalidAgents.push(agentName)
      continue
    }

    const nextTarget = options.global ? target.globalPath() : target.projectPath
    if (nextTarget === '.agents/skills' && options.installDir === '.agents/skills') {
      continue
    }

    linkTargets.push(nextTarget)
  }

  return {
    invalidAgents,
    linkTargets: dedupePreserveOrder(linkTargets),
  }
}

export function getSkillsPackageManagerHome(): string {
  return (
    process.env.SKILLS_PACKAGE_MANAGER_HOME?.trim() ||
    path.join(getHomeDir(), '.skills-package-manager')
  )
}

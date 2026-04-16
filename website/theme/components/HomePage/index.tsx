import { useFrontmatter } from '@rspress/core/runtime'
import { Button } from '@rspress/core/theme-original'
import { type ReactNode, useEffect, useState } from 'react'
import './index.css'

import { version } from '../../../../package.json'

interface HomeAction {
  text: string
  link: string
  theme?: 'brand' | 'alt'
}

interface HomeHero {
  name?: string
  text?: string
  tagline?: string
  image?: {
    src: string
    alt?: string
  }
  actions?: HomeAction[]
}

interface HomeFeature {
  title: string
  details: string
  icon?: string
}

interface HomeQuickStart {
  label: string
  command: string
  agentText: string
}

interface HomeConcept {
  title: string
  details: string
  icon: string
}

interface HomeFrontmatter {
  hero?: HomeHero
  features?: HomeFeature[]
  quickStarts?: HomeQuickStart[]
  concepts?: HomeConcept[]
}

function Icon({ children, viewBox = '0 0 24 24' }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="28"
      height="28"
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="spm-icon-svg"
    >
      {children}
    </svg>
  )
}

function getFeatureIcon(name?: string) {
  switch (name) {
    case 'lock':
      return (
        <Icon>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </Icon>
      )
    case 'globe':
      return (
        <Icon>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="3.5" ry="9" />
          <path d="M3 12h18" />
        </Icon>
      )
    case 'swap':
      return (
        <Icon>
          <path d="M4 9h10" />
          <path d="M9 5l4 4-4 4" />
          <path d="M20 15H10" />
          <path d="M15 11l4 4-4 4" />
        </Icon>
      )
    case 'plug':
      return (
        <Icon>
          <path d="M12 2v8" />
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <path d="M6 10h12v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-5Z" />
        </Icon>
      )
    case 'shield':
      return (
        <Icon>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        </Icon>
      )
    case 'multi':
      return (
        <Icon>
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          <rect x="4" y="8" width="12" height="10" rx="2" />
        </Icon>
      )
    default:
      return (
        <Icon>
          <circle cx="12" cy="12" r="9" />
        </Icon>
      )
  }
}

function getConceptIcon(icon: string) {
  if (icon === 'manifest') {
    return (
      <Icon>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </Icon>
    )
  }
  if (icon === 'lockfile') {
    return (
      <Icon>
        <path d="M15 3H9a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />
        <path d="M9 3v18" />
        <path d="m10 9-1 1 1 1" />
        <path d="m14 13-1 1 1 1" />
      </Icon>
    )
  }
  return null
}

function CopyButton({ text, label, isAi }: { text: string; label: string; isAi?: boolean }) {
  const [copied, setCopied] = useState(false)

  const fallbackCopyText = (value: string) => {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()

    let succeeded = false
    try {
      succeeded = document.execCommand('copy')
    } catch (err) {
      console.error('Fallback copy failed', err)
    } finally {
      document.body.removeChild(textarea)
    }

    return succeeded
  }

  const handleCopy = async () => {
    try {
      let succeeded = false

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        succeeded = true
      } else {
        succeeded = fallbackCopyText(text)
      }

      if (succeeded) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch (err) {
      if (fallbackCopyText(text)) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } else {
        console.error('Failed to copy text: ', err)
      }
    }
  }

  return (
    <button
      className={`spm-copy-btn ${isAi ? 'spm-copy-btn--ai' : ''}`}
      onClick={handleCopy}
      type="button"
      aria-label="Copy to clipboard"
    >
      {isAi && <span className="spm-copy-btn__ai-glow" />}
      {copied ? (
        <span className="spm-copy-btn-text">Copied!</span>
      ) : (
        <span className="spm-copy-btn-text">{label}</span>
      )}
    </button>
  )
}

interface TerminalLine {
  id: number
  content: ReactNode
}

function Terminal() {
  const [lines, setLines] = useState<TerminalLine[]>([])

  useEffect(() => {
    const terminalLines: ReactNode[] = [
      <span key="1" className="t-cmd">
        $ npx skills-package-manager install
      </span>,
      <span key="2">
        <span className="t-success">✔</span> Resolving skills.json...
      </span>,
      <span key="3">
        <span className="t-success">✔</span> Downloading pr-creator (git)
      </span>,
      <span key="4">
        <span className="t-success">✔</span> Extracting npm-skill (npm)
      </span>,
      <span key="5">
        <span className="t-success">✔</span> Linking local-dev (link)
      </span>,
      <span key="6">
        <span className="t-success">✔</span> Extracting legacy-v1 (file)
      </span>,
      <span key="7">
        <span className="t-success">✔</span> Linking .claude/skills
      </span>,
      <span key="8">
        <span className="t-success">✔</span> Linking .cursor/skills
      </span>,
      <span key="9">
        <span className="t-success">✔</span> Updating skills-lock.yaml
      </span>,
      <span key="10" className="t-done">
        ✨ Done in 1.2s
      </span>,
    ]

    let currentLine = 0
    const interval = setInterval(() => {
      if (currentLine < terminalLines.length) {
        setLines((prev) => [...prev, { id: currentLine, content: terminalLines[currentLine] }])
        currentLine++
      } else {
        clearInterval(interval)
        setTimeout(() => {
          setLines([])
          currentLine = 0
          const restartInterval = setInterval(() => {
            if (currentLine < terminalLines.length) {
              setLines((prev) => [
                ...prev,
                { id: currentLine, content: terminalLines[currentLine] },
              ])
              currentLine++
            } else {
              clearInterval(restartInterval)
            }
          }, 400)
        }, 3000)
      }
    }, 400)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="spm-hero-window spm-terminal-window">
      <div className="spm-hero-window__header">
        <div className="spm-hero-window__dots">
          <span className="t-dot t-dot--red" />
          <span className="t-dot t-dot--yellow" />
          <span className="t-dot t-dot--green" />
        </div>
        <div className="spm-hero-window__title">bash</div>
      </div>
      <div className="spm-hero-window__body">
        {lines.map((line) => (
          <div key={line.id} className="spm-hero-window__line">
            {line.content}
          </div>
        ))}
        <span className="spm-hero-window__cursor" />
      </div>
    </div>
  )
}

function ConfigViewer() {
  const [activeTab, setActiveTab] = useState<'manifest' | 'lock'>('manifest')

  const manifestCode = [
    { line: 1, text: '{' },
    {
      line: 2,
      text: `  "$schema": "https://unpkg.com/skills-package-manager@${version}/skills.schema.json",`,
    },
    { line: 3, text: '  "installDir": ".agents/skills",' },
    { line: 4, text: '  "linkTargets": [".claude/skills", ".cursor/skills"],' },
    { line: 5, text: '  "selfSkill": false,' },
    { line: 6, text: '  "skills": {' },
    {
      line: 7,
      text: '    "pr-creator": "https://github.com/rstackjs/agent-skills.git#89bd10a...&path:/skills/pr-creator",',
    },
    { line: 8, text: '    "npm-skill": "npm:@scope/agent-logic@^1.2.0",' },
    { line: 9, text: '    "local-dev": "link:./packages/my-custom-skill",' },
    { line: 10, text: '    "legacy-v1": "file:./backups/old-agent.tgz"' },
    { line: 11, text: '  }' },
    { line: 12, text: '}' },
  ]

  const lockCode = [
    { line: 1, text: 'lockfileVersion: "0.1"' },
    { line: 2, text: 'installDir: .agents/skills' },
    { line: 3, text: 'linkTargets:' },
    { line: 4, text: '  - .claude/skills' },
    { line: 5, text: 'skills:' },
    { line: 6, text: '  pr-creator:' },
    { line: 7, text: '    specifier: https://github.com/rstackjs/agent-skills.git#89bd10a...' },
    { line: 8, text: '    resolution:' },
    { line: 9, text: '      type: git' },
    { line: 10, text: '      commit: 89bd10a842356073382b281509b4c8af7f9eb5a8' },
  ]

  const highlightLine = (text: string) => {
    const parts: ReactNode[] = []
    const regex = /("[^"]+")(:?)|([{}[\],])|(\w+:)/g
    let lastIndex = 0
    let match: RegExpExecArray | null = null

    while (true) {
      match = regex.exec(text)
      if (match === null) break

      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index))
      }

      if (match[1]) {
        // JSON key or value
        const isKey = match[2] === ':'
        parts.push(
          <span key={match.index} className={isKey ? 'c-key' : 'c-val'}>
            {match[1]}
          </span>,
        )
        if (isKey) parts.push(':')
      } else if (match[3]) {
        // JSON/YAML punctuation
        parts.push(
          <span key={match.index} className="c-punc">
            {match[3]}
          </span>,
        )
      } else if (match[4]) {
        // YAML key
        parts.push(
          <span key={match.index} className="c-key">
            {match[4]}
          </span>,
        )
      }

      lastIndex = regex.lastIndex
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }

    return parts
  }

  const code = activeTab === 'manifest' ? manifestCode : lockCode

  return (
    <div className="spm-hero-window spm-config-window">
      <div className="spm-hero-window__header">
        <div className="spm-hero-window__dots">
          <span className="t-dot t-dot--red" />
          <span className="t-dot t-dot--yellow" />
          <span className="t-dot t-dot--green" />
        </div>
        <div className="spm-hero-window__tabs">
          <button
            type="button"
            className={`t-tab ${activeTab === 'manifest' ? 't-tab--active' : ''}`}
            onClick={() => setActiveTab('manifest')}
          >
            skills.json
          </button>
          <button
            type="button"
            className={`t-tab ${activeTab === 'lock' ? 't-tab--active' : ''}`}
            onClick={() => setActiveTab('lock')}
          >
            skills-lock.yaml
          </button>
        </div>
      </div>
      <div className="spm-hero-window__body">
        <pre className="spm-config__code">
          <code>
            {code.map((item) => (
              <div key={item.line} className="spm-config__line">
                <span className="spm-config__line-num">{item.line}</span>
                <span className="spm-config__line-content">{highlightLine(item.text)}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  )
}

function getActionTheme(theme?: HomeAction['theme']) {
  return theme === 'alt' ? 'alt' : 'brand'
}

export function HomePage() {
  const { frontmatter } = useFrontmatter() as { frontmatter?: HomeFrontmatter }
  const hero = frontmatter?.hero
  const features = frontmatter?.features ?? []
  const quickStarts = frontmatter?.quickStarts ?? []
  const concepts = frontmatter?.concepts ?? []
  const heroActions = hero?.actions ?? []

  return (
    <div className="spm-home-wrapper">
      <div className="spm-grid-bg" />

      <div className="spm-hero-section">
        <div className="spm-hero-container">
          <div className="spm-hero-content">
            <div className="spm-hero-logo">
              <img src="/logo-light.svg" alt="logo" />
            </div>
            <h1 className="spm-hero-title">
              <span className="spm-hero-title-brand">{hero?.name ?? 'skills-package-manager'}</span>
            </h1>
            <p className="spm-hero-subtitle">{hero?.text}</p>
            <p className="spm-hero-tagline">{hero?.tagline}</p>
            <div className="spm-hero-actions">
              {heroActions.map((action) => (
                <Button
                  key={`${action.text}-${action.link}`}
                  type="a"
                  href={action.link}
                  theme={getActionTheme(action.theme)}
                  className="spm-hero-action-btn"
                >
                  {action.text}
                </Button>
              ))}
            </div>
          </div>
          <div className="spm-hero-visual">
            <div className="spm-3d-container">
              <ConfigViewer />
              <Terminal />
            </div>
            <div className="spm-neon-pulse" />
          </div>
        </div>
      </div>

      <div className="spm-quickstart-section">
        <div className="spm-container">
          <div className="spm-section-header">
            <h2>Get Started Instantly</h2>
            <p>Choose your workflow and copy the command to your terminal or your AI agent.</p>
          </div>
          <div className="spm-quickstart-cards">
            {quickStarts.map((item) => (
              <div key={item.label} className="spm-quickstart-card">
                <div className="spm-quickstart-card-header">
                  <h3 className="spm-quickstart-label">{item.label}</h3>
                  <div className="spm-quickstart-actions">
                    <CopyButton text={item.agentText} label="Copy for Agent" isAi />
                  </div>
                </div>
                <div className="spm-quickstart-code-wrapper">
                  <pre className="spm-quickstart-code">
                    <code>{item.command}</code>
                  </pre>
                  <CopyButton text={item.command} label="Copy Code" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="spm-features-section">
        <div className="spm-container">
          <div className="spm-section-header">
            <h2>Why skills-package-manager?</h2>
            <p>
              Designed specifically to handle the complexities of managing AI agent skills
              seamlessly.
            </p>
          </div>
          <div className="spm-features-grid">
            {features.map((f) => (
              <div key={f.title} className="spm-feature-card">
                <div className="spm-feature-icon-wrapper">{getFeatureIcon(f.icon)}</div>
                <h3 className="spm-feature-title">{f.title}</h3>
                <p className="spm-feature-desc">{f.details}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="spm-concepts-section">
        <div className="spm-container">
          <div className="spm-section-header">
            <h2>Core Concepts</h2>
            <p>Two simple files power your entire workflow.</p>
          </div>
          <div className="spm-concepts-grid">
            {concepts.map((c) => (
              <div key={c.title} className="spm-concept-card">
                <div className="spm-concept-icon-wrapper">{getConceptIcon(c.icon)}</div>
                <div className="spm-concept-content">
                  <h3 className="spm-concept-title">{c.title}</h3>
                  <p className="spm-concept-desc">{c.details}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="spm-cta-section">
        <div className="spm-container">
          <div className="spm-cta-box">
            <h2 className="spm-cta-title">Ready to take control of your agent skills?</h2>
            <p className="spm-cta-desc">Start building robust, reproducible AI workflows today.</p>
            <div className="spm-cta-actions">
              <Button type="a" href="/getting-started" theme="brand" className="spm-cta-btn">
                Read the Documentation
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

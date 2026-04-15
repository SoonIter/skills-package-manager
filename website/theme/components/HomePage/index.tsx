import { useFrontmatter } from '@rspress/core/runtime'
import { Button, Link } from '@rspress/core/theme-original'
import { useState } from 'react'
import './index.css'

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
}

interface HomeQuickStart {
  label: string
  command: string
  agentText: string
}

interface HomeFrontmatter {
  hero?: HomeHero
  features?: HomeFeature[]
  quickStarts?: HomeQuickStart[]
}

const DEFAULT_FEATURES: HomeFeature[] = [
  {
    title: 'Lockfile-driven version control',
    details:
      'skills-lock.yaml locks every skill resolution. No need to commit skill files to git. Run npx skills-package-manager update to refresh all skills in one shot.',
  },
  {
    title: 'Any source you need',
    details:
      'Supports link, npm, git, file, and even sub-folders inside a .tgz tarball. Mix local development and remote packages freely.',
  },
  {
    title: 'Drop-in replacement for npx skills',
    details:
      'Already used to npx skills? Just swap the command name: npx skills add becomes npx skills-package-manager add.',
  },
  {
    title: 'Built for pnpm users',
    details:
      'pnpm-plugin-skills hooks into pnpm install so your skills sync automatically with your dependencies.',
  },
  {
    title: 'Open source & privacy-first',
    details:
      'Pure client-side tooling. No registry lock-in, no cloud services, and zero telemetry or tracking.',
  },
  {
    title: 'Multi-agent ready',
    details:
      'Install skills once, then link them into .claude/skills, .cursor/skills, or any agent-specific directory you define.',
  },
]

const DEFAULT_QUICK_STARTS: HomeQuickStart[] = [
  {
    label: 'CLI',
    command: `npx skills-package-manager init --yes
npx skills-package-manager add vercel-labs/skills
npx skills-package-manager install`,
    agentText:
      'Please use spm to initialize this project, add the skill "vercel-labs/skills", and install all skills.',
  },
  {
    label: 'pnpm',
    command: 'pnpm add pnpm-plugin-skills --config',
    agentText:
      'Please add pnpm-plugin-skills as a pnpm config dependency so skills sync automatically on install.',
  },
]

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="spm-home__icon-svg"
    >
      {children}
    </svg>
  )
}

const FEATURE_ICONS = [
  // Lock
  <Icon key="lock">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>,
  // Globe
  <Icon key="globe">
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="3.5" ry="9" />
    <path d="M3 12h18" />
  </Icon>,
  // Swap
  <Icon key="swap">
    <path d="M4 9h10" />
    <path d="M9 5l4 4-4 4" />
    <path d="M20 15H10" />
    <path d="M15 11l4 4-4 4" />
  </Icon>,
  // Plug
  <Icon key="plug">
    <path d="M12 2v8" />
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <path d="M6 10h12v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-5Z" />
  </Icon>,
  // Shield
  <Icon key="shield">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  </Icon>,
  // Multi-agent (two overlapping squares / layers)
  <Icon key="multi">
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    <rect x="4" y="8" width="12" height="10" rx="2" />
  </Icon>,
]

function ForAgentButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button className="spm-home__agent-btn" onClick={handleCopy}>
      <span className="spm-home__agent-btn-check">{copied ? 'Copied' : 'for Agent'}</span>
    </button>
  )
}

function getActionTheme(theme?: HomeAction['theme']) {
  return theme === 'alt' ? 'alt' : 'brand'
}

export function HomePage() {
  const { frontmatter } = useFrontmatter() as { frontmatter?: HomeFrontmatter }
  const hero = frontmatter?.hero
  const features = frontmatter?.features ?? DEFAULT_FEATURES
  const quickStarts = frontmatter?.quickStarts ?? DEFAULT_QUICK_STARTS
  const heroActions = hero?.actions ?? []
  const heroImage = hero?.image

  return (
    <div className="spm-home">
      <section className="spm-home__hero">
        <div className="spm-home__hero-content">
          <h1 className="spm-home__title">
            <span className="spm-home__title-brand">{hero?.name ?? 'skills-package-manager'}</span>
          </h1>
          <p className="spm-home__subtitle">{hero?.text ?? 'Package manager for agent skills'}</p>
          <p className="spm-home__tagline">
            {hero?.tagline ?? 'Manage, install, and link SKILL.md-based agent skills with ease.'}
          </p>
          <div className="spm-home__actions">
            {heroActions.map((action) => (
              <Button
                key={`${action.text}-${action.link}`}
                type="a"
                href={action.link}
                theme={getActionTheme(action.theme)}
                className="spm-home__action"
              >
                {action.text}
              </Button>
            ))}
          </div>
        </div>
        <div className="spm-home__hero-image">
          <img
            src={heroImage?.src ?? '/logo-light.svg'}
            alt={heroImage?.alt ?? 'skills-package-manager logo'}
            width={280}
            height={280}
          />
        </div>
      </section>

      <section className="spm-home__quickstart">
        <div className="spm-home__section-header">
          <h2 className="spm-home__section-title">Get started in seconds</h2>
          <p className="spm-home__section-subtitle">
            Copy the command for yourself, or click the left button to copy a prompt for your AI agent.
          </p>
        </div>
        <div className="spm-home__quickstart-list">
          {quickStarts.map((item) => (
            <div key={item.label} className="spm-home__quick-bar">
              <ForAgentButton text={item.agentText} />
              <div className="spm-home__quick-bar-code">
                <pre>
                  <code>{item.command}</code>
                </pre>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="spm-home__features">
        <div className="spm-home__section-header">
          <h2 className="spm-home__section-title">Why skills-package-manager?</h2>
          <p className="spm-home__section-subtitle">
            A lightweight, open-source package manager designed for AI agent skills.
          </p>
        </div>
        <div className="spm-home__features-grid">
          {features.map((f, i) => (
            <div key={f.title} className="spm-home__feature">
              <div className="spm-home__feature-icon">{FEATURE_ICONS[i]}</div>
              <h3 className="spm-home__feature-title">{f.title}</h3>
              <p className="spm-home__feature-desc">{f.details}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="spm-home__cta">
        <div className="spm-home__cta-inner">
          <h2 className="spm-home__cta-title">Ready to manage your skills?</h2>
          <div className="spm-home__cta-actions">
            <Button type="a" href="/getting-started" theme="brand" className="spm-home__action">
              Read the Guide
            </Button>
            <Link href="https://github.com/SoonIter/skills-pm" className="spm-home__cta-link">
              View on GitHub
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

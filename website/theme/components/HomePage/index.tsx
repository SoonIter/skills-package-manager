import { Button, Link } from '@rspress/core/theme-original'
import './index.css'

const FEATURES = [
  {
    icon: '📦',
    title: 'Easy Management',
    desc: 'Install, update, and link skills using simple CLI commands.',
  },
  {
    icon: '🔌',
    title: 'pnpm Integration',
    desc: 'Automatically sync skills during pnpm install with the dedicated plugin.',
  },
  {
    icon: '🔒',
    title: 'Lockfile Support',
    desc: 'Resolve and lock skill versions for reproducible environments.',
  },
  {
    icon: '🌐',
    title: 'Multiple Protocols',
    desc: 'Supports npm packages, git repositories, and local link targets out of the box.',
  },
]

const PROTOCOLS = [
  { key: 'npm', label: 'npm', desc: 'Install from any npm registry or tarball.' },
  { key: 'git', label: 'git', desc: 'Clone and resolve directly from git repositories.' },
  { key: 'link', label: 'link', desc: 'Symlink local directories for rapid development.' },
]

export function HomePage() {
  return (
    <div className="spm-home">
      <section className="spm-home__hero">
        <div className="spm-home__hero-content">
          <h1 className="spm-home__title">
            <span className="spm-home__title-brand">skills-package-manager</span>
          </h1>
          <p className="spm-home__subtitle">Package manager for agent skills</p>
          <p className="spm-home__tagline">
            Manage, install, and link SKILL.md-based agent skills with ease.
          </p>
          <div className="spm-home__actions">
            <Button type="a" href="/getting-started" theme="brand" className="spm-home__action">
              Get Started
            </Button>
            <Button type="a" href="/introduction" theme="alt" className="spm-home__action">
              Introduction
            </Button>
          </div>
        </div>
        <div className="spm-home__hero-image">
          <img src="/logo-light.svg" alt="skills-package-manager logo" width={280} height={280} />
        </div>
      </section>

      <section className="spm-home__protocols">
        <div className="spm-home__protocols-inner">
          {PROTOCOLS.map((p) => (
            <div key={p.key} className="spm-home__protocol">
              <div className="spm-home__protocol-badge">{p.label}</div>
              <div className="spm-home__protocol-text">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="spm-home__features">
        <div className="spm-home__features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="spm-home__feature">
              <div className="spm-home__feature-icon">{f.icon}</div>
              <h3 className="spm-home__feature-title">{f.title}</h3>
              <p className="spm-home__feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="spm-home__code">
        <div className="spm-home__code-inner">
          <h2 className="spm-home__code-title">Get started in seconds</h2>
          <pre className="spm-home__code-block">
            <code>{`npx skills-package-manager init --yes
npx skills-package-manager add vercel-labs/skills
npx skills-package-manager install`}</code>
          </pre>
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
              View on GitHub →
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

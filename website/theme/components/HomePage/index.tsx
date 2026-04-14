import { useFrontmatter } from '@rspress/core/runtime'
import { Button, Link } from '@rspress/core/theme-original'
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
  icon?: string
}

interface HomeProtocol {
  key: string
  label: string
  desc: string
}

interface HomeFrontmatter {
  hero?: HomeHero
  features?: HomeFeature[]
  protocols?: HomeProtocol[]
}

const DEFAULT_PROTOCOLS: HomeProtocol[] = [
  { key: 'npm', label: 'npm', desc: 'Install from any npm registry or tarball.' },
  { key: 'git', label: 'git', desc: 'Clone and resolve directly from git repositories.' },
  { key: 'link', label: 'link', desc: 'Symlink local directories for rapid development.' },
]

const QUICK_START_COMMANDS = `npx skills-package-manager init --yes
npx skills-package-manager add vercel-labs/skills
npx skills-package-manager install`

function getActionTheme(theme?: HomeAction['theme']) {
  return theme === 'alt' ? 'alt' : 'brand'
}

export function HomePage() {
  const { frontmatter } = useFrontmatter() as { frontmatter?: HomeFrontmatter }
  const hero = frontmatter?.hero
  const features = frontmatter?.features ?? []
  const protocols = frontmatter?.protocols ?? DEFAULT_PROTOCOLS
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

      <section className="spm-home__protocols">
        <div className="spm-home__protocols-inner">
          {protocols.map((p) => (
            <div key={p.key} className="spm-home__protocol">
              <div className="spm-home__protocol-badge">{p.label}</div>
              <div className="spm-home__protocol-text">{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="spm-home__features">
        <div className="spm-home__features-grid">
          {features.map((f) => (
            <div key={f.title} className="spm-home__feature">
              <div className="spm-home__feature-icon">{f.icon}</div>
              <h3 className="spm-home__feature-title">{f.title}</h3>
              <p className="spm-home__feature-desc">{f.details}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="spm-home__code">
        <div className="spm-home__code-inner">
          <h2 className="spm-home__code-title">Get started in seconds</h2>
          <pre className="spm-home__code-block">
            <code>{QUICK_START_COMMANDS}</code>
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

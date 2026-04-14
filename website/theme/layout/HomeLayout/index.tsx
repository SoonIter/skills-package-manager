import { useFrontmatter } from '@rspress/core/runtime'
import { HomePage } from '../../components/HomePage'

export interface HomeLayoutProps {
  beforeHero?: React.ReactNode
  afterHero?: React.ReactNode
  beforeFeatures?: React.ReactNode
  afterFeatures?: React.ReactNode
  beforeHeroActions?: React.ReactNode
  afterHeroActions?: React.ReactNode
}

function HomeLayoutMarkdown() {
  const { frontmatter } = useFrontmatter()
  const hero = frontmatter?.hero
  const features = frontmatter?.features
  const lines: string[] = []

  if (hero) {
    if (hero.name) {
      lines.push(`# ${hero.name}`)
      lines.push('')
    }
    if (hero.text) {
      lines.push(hero.text)
      lines.push('')
    }
    if (hero.tagline) {
      lines.push(`> ${hero.tagline}`)
      lines.push('')
    }
    if (hero.actions && hero.actions.length > 0) {
      const actionLinks = hero.actions
        .map((action: { text: string; link: string }) => `[${action.text}](${action.link})`)
        .join(' | ')
      lines.push(actionLinks)
      lines.push('')
    }
  }

  if (features && features.length > 0) {
    lines.push('## Features')
    lines.push('')
    for (const feature of features) {
      const icon = feature.icon ? `${feature.icon} ` : ''
      const title = feature.link
        ? `[${icon}**${feature.title}**](${feature.link})`
        : `${icon}**${feature.title}**`
      lines.push(`- ${title}: ${feature.details}`)
    }
    lines.push('')
  }

  return <>{lines.join('\n')}</>
}

export function HomeLayout(_props: HomeLayoutProps) {
  if (process.env.__SSR_MD__) {
    return <HomeLayoutMarkdown />
  }

  return (
    <>
      <HomePage />
    </>
  )
}

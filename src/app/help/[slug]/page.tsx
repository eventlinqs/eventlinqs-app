import type { Metadata } from 'next'
import { BookOpen } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { EmptyState } from '@/components/ui/EmptyState'

interface Props {
  params: Promise<{ slug: string }>
}

/** Convert a URL slug to Title Case for display in the hero. */
function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const title = slugToTitle(slug)
  return {
    title: `${title} — Help Centre — EventLinqs`,
    description: `Help articles about ${title.toLowerCase()} on EventLinqs. Our team is happy to answer directly while we build this section out.`,
  }
}

export default async function HelpSlugPage({ params }: Props) {
  const { slug } = await params
  const title = slugToTitle(slug)

  return (
    <PageShell>
      <PageHero
        eyebrow="HELP CENTRE"
        title={title}
        subtitle="We're still building this section — our team is happy to answer directly."
      />

      <ContentSection surface="base" width="default">
        <EmptyState
          icon={BookOpen}
          title="Articles coming soon"
          description="We're writing detailed guides for this section. In the meantime, our support team can answer any question directly."
          primaryAction={{ label: 'Back to Help Centre', href: '/help' }}
          secondaryAction={{ label: 'Contact support', href: '/contact' }}
        />
      </ContentSection>
    </PageShell>
  )
}

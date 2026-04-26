import { Compass } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * Custom 404 - rendered automatically by Next.js for any unmatched route.
 * No metadata export needed here; Next.js sets a default 404 title.
 */
export default function NotFound() {
  return (
    <PageShell>
      <PageHero
        eyebrow="404"
        title="We can't find that page"
        subtitle="It may have moved, or it was never here. Let's get you back to the culture."
        align="center"
      />

      <ContentSection surface="base" width="default">
        <EmptyState
          icon={Compass}
          title="Lost your way?"
          description="Try the homepage or browse what's on right now."
          primaryAction={{ label: 'Back home', href: '/' }}
          secondaryAction={{ label: 'Browse events', href: '/events' }}
        />
      </ContentSection>
    </PageShell>
  )
}

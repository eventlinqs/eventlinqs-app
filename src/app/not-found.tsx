import { Compass } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageHero } from '@/components/layout/PageHero'
import { ContentSection } from '@/components/layout/ContentSection'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * Custom 404 - rendered automatically by Next.js for any unmatched route.
 * No metadata export needed here; Next.js sets a default 404 title.
 *
 * `staticSafe`, AND THIS IS NOT ABOUT THE 404 PAGE (close-out C8, 18 September
 * 2026). Next serialises the ROOT NOT-FOUND BOUNDARY into the RSC payload of
 * every page, not only into a real 404. Measured on this build against a real
 * session: the copy below appeared once in the response for `/`, for `/events`
 * and for `/events/browse/melbourne`, and it brought a second `SiteHeader` with
 * it. That header read the session and put the visitor's display name and email
 * address into all three responses, two of which Vercel is asked to cache and
 * hand to every other visitor.
 *
 * So the anonymous header here is what keeps an identity out of every page on
 * the platform, and the visible cost is only that a signed-in visitor who lands
 * on a genuine 404 sees the signed-out header on it.
 * scripts/guards/edge-cache-is-viewer-independent.mjs refuses its removal.
 */
export default function NotFound() {
  return (
    <PageShell staticSafe>
      <PageHero
        eyebrow="404"
        title="We can't find that page"
        subtitle="It may have moved, or it was never here. Let's get you back to the community."
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

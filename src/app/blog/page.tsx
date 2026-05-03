import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = {
  title: 'Blog | EventLinqs',
  description: 'Event production, organiser wisdom, and culture-first ticketing from the EventLinqs team.',
}

export default function BlogPage() {
  return (
    <PageShell>
      <ComingSoon
        title="Blog"
        blurb="Organiser playbooks, community spotlights and product notes land here soon."
      />
    </PageShell>
  )
}

import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = {
  title: 'Careers | EventLinqs',
  description: 'Join the team building EventLinqs.',
}

export default function CareersPage() {
  return (
    <PageShell>
      <ComingSoon
        title="Careers"
        blurb="We'll post roles here when we're hiring. Until then, the best way in is to build with us - organisers and attendees, start on the events page."
      />
    </PageShell>
  )
}

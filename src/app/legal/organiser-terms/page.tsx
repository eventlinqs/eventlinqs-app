import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { ComingSoon } from '@/components/ui/coming-soon'

export const metadata: Metadata = {
  title: 'Organiser Terms | EventLinqs',
  description: 'Terms that apply to event organisers using EventLinqs.',
}

export default function OrganiserTermsPage() {
  return (
    <PageShell>
      <ComingSoon
        title="Organiser Terms"
        eyebrow="Legal"
        blurb="Specific organiser terms are being drafted. In the meantime, our general Terms of Use apply to every account."
      />
    </PageShell>
  )
}

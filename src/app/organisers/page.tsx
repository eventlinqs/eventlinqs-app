import type { Metadata } from 'next'
import { OrganisersLandingPage } from '@/components/templates/OrganisersLandingPage'

// ISR: re-read the live platform fee from pricing_rules at most once a minute so
// the organisers fee display tracks the admin-set value (static-constant
// fallback inside getLivePublicFee keeps it from ever 500ing).
export const revalidate = 60

export const metadata: Metadata = {
  title: 'For Organisers | EventLinqs',
  description:
    'Sell tickets on EventLinqs. Self-serve sign-up, transparent fees, real-time sales tools, and a checkout your audience will actually complete. Open to every organiser and every community.',
  alternates: { canonical: '/organisers' },
}

export default function OrganisersPage() {
  return <OrganisersLandingPage />
}

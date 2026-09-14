import type { Metadata } from 'next'
import { OrganisersLandingPage } from '@/components/templates/OrganisersLandingPage'

// ISR: re-read the live platform fee from pricing_rules at most once a minute so
// the organisers fee display tracks the admin-set value (static-constant
// fallback inside getLivePublicFee keeps it from ever 500ing).
export const revalidate = 60

const TITLE = 'For Organisers | EventLinqs'
const DESCRIPTION =
  'Sell tickets on EventLinqs. Self-serve sign-up, transparent fees, real-time sales tools, and a checkout your audience will actually complete. Open to every organiser and every community.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/organisers' },
  // The same defect and the same fix as /pricing (close-out SEO5 step 7): this
  // route declared no openGraph block, so every share of the organiser landing
  // carried the platform's site-level sentence rather than this page's.
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/organisers',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function OrganisersPage() {
  return <OrganisersLandingPage />
}

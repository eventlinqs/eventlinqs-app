import type { Metadata } from 'next'
import { OrganisersLandingPage } from '@/components/templates/OrganisersLandingPage'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { createPublicClient } from '@/lib/supabase/public-client'

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
    // This block replaces the root's, so without its own image a share carried no picture (window 2's audit, 29 Oct).
    images: ['/opengraph-image'],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/opengraph-image'] },
}

export default async function OrganisersPage() {
  // What the page promises about reach follows the two broadcast flags, read as an edge-cached page reads a flag (the
  // public client, cachedPage), the same read the organiser profile makes (the CONTROLLER's 02:20 of 6 November 2026).
  const [followOn, digestOn] = await Promise.all([
    isFeatureEnabled('broadcast_follow', { client: createPublicClient(), cachedPage: true }),
    isFeatureEnabled('broadcast_digest', { client: createPublicClient(), cachedPage: true }),
  ])
  return <OrganisersLandingPage broadcastsOn={followOn && digestOn} />
}

import type { Metadata } from 'next'
import { OrganisersLandingPage } from '@/components/templates/OrganisersLandingPage'

export const metadata: Metadata = {
  title: 'For Organisers | EventLinqs',
  description:
    'Sell tickets on EventLinqs. Self-serve sign-up, transparent fees, real-time sales tools, and a checkout your audience will actually complete. Open to every organiser and every community.',
}

export default function OrganisersPage() {
  return <OrganisersLandingPage />
}

import type { Metadata } from 'next'
import { PricingPage } from '@/components/templates/PricingPage'

export const metadata: Metadata = {
  title: 'Pricing | EventLinqs',
  description:
    'Simple, transparent pricing for event organisers. Free events always have zero platform fees. Paid tickets: 2.5% + AUD 0.50 per ticket, the whole fee. No upfront costs.',
  alternates: { canonical: '/pricing' },
}

export default function PricingRoute() {
  return <PricingPage />
}

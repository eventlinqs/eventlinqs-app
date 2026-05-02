import type { Metadata } from 'next'
import { PricingPage } from '@/components/templates/PricingPage'

export const metadata: Metadata = {
  title: 'Pricing | EventLinqs',
  description:
    'Simple, transparent pricing for event organisers. Free events always have zero platform fees. Paid events from 2.9% + AUD 0.59 per ticket. No upfront costs.',
  alternates: { canonical: '/pricing' },
}

export default function PricingRoute() {
  return <PricingPage />
}

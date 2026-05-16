import type { Metadata } from 'next'
import { PricingPage } from '@/components/templates/PricingPage'

export const metadata: Metadata = {
  title: 'Pricing | EventLinqs',
  // Fee wording mirrors the canonical pricing-copy module. No hedging,
  // no stale placeholder. Keep in sync with src/components/marketing/pricing-copy.tsx.
  description:
    'Simple, transparent pricing for event organisers. Free events are free, forever. Paid tickets: 2.5% + 50¢ AUD each. No upfront costs, no surprise fees.',
  alternates: { canonical: '/pricing' },
}

export default function PricingRoute() {
  return <PricingPage />
}

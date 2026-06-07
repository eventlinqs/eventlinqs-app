import type { Metadata } from 'next'
import { PricingPage } from '@/components/templates/PricingPage'

// Read the platform fee live from pricing_rules on each request so the displayed
// fee always equals the charged fee (single source of truth). The page renders
// fast (one cached fee read) and never 500s (static-constant fallback).
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pricing | EventLinqs',
  description:
    'Simple, transparent pricing for event organisers. Free events always have zero platform fees. Paid tickets: 2% + AUD 0.50 per ticket, the whole fee. No upfront costs.',
  alternates: { canonical: '/pricing' },
}

export default function PricingRoute() {
  return <PricingPage />
}

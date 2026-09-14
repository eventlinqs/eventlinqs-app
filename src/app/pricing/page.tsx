import type { Metadata } from 'next'
import { PricingPage } from '@/components/templates/PricingPage'

// Read the platform fee live from pricing_rules on each request so the displayed
// fee always equals the charged fee (single source of truth). The page renders
// fast (one cached fee read) and never 500s (static-constant fallback).
export const dynamic = 'force-dynamic'

const TITLE = 'Pricing | EventLinqs'
const DESCRIPTION =
  'Simple, transparent pricing for event organisers. Free events always have zero platform fees. Paid tickets: one clear fee per ticket shown in full on the page, the whole fee. No upfront costs.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/pricing' },
  /*
   * THE SHARE PREVIEW WAS SITE-LEVEL COPY (close-out SEO5 step 7).
   *
   * `title` and `description` do NOT become `og:title` and `og:description`.
   * Next merges metadata field by field, so a route that declares no
   * `openGraph` block inherits whatever the root layout declares, and every
   * share of this page carried the platform's generic sentence instead of the
   * page's own.
   *
   * That matters more here than on most platforms: WhatsApp and Facebook
   * sharing are named in this product's own help content as a differentiator,
   * so the preview card IS the marketing surface.
   *
   * Composed from the same two constants the page's title and description use,
   * so the three can never drift into saying different things about one page.
   */
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/pricing',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function PricingRoute() {
  return <PricingPage />
}

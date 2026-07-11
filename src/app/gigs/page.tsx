import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import {
  fetchOpenGigs,
  isPayType,
  isPerformanceType,
  type GigBoardFilters,
} from '@/lib/marketplace/gigs'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { MarketplaceHero } from '@/components/marketplace/marketplace-hero'
import { GigCard } from '@/components/marketplace/gig-card'
import { GigFilters } from '@/components/marketplace/gig-filters'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Gigs for performers | EventLinqs',
  description:
    'Open gigs from Australian organisers. Apply with your EventLinqs performer profile: your shows, your following, and the tickets your sharing sold travel with every application.',
  alternates: { canonical: '/gigs' },
}

type SearchParams = Promise<{ city?: string; type?: string; pay?: string }>

/**
 * The gig board (flag gig_board): organisers post, performers apply with
 * proof. A hard 404 while the stage is off, so nothing half-on faces a user.
 */
export default async function GigBoardPage({ searchParams }: { searchParams: SearchParams }) {
  if (!(await isFeatureEnabled('gig_board'))) notFound()

  const raw = await searchParams
  const filters: GigBoardFilters = {
    citySlug: raw.city && /^[a-z0-9-]{2,60}$/.test(raw.city) ? raw.city : null,
    performanceType: raw.type && isPerformanceType(raw.type) ? raw.type : null,
    payType: raw.pay && isPayType(raw.pay) ? raw.pay : null,
  }

  const admin = createAdminClient()
  const [gigs, citiesResult] = await Promise.all([
    fetchOpenGigs(admin, filters),
    admin.from('cities').select('slug, name').order('tier').order('name'),
  ])
  const cities = (citiesResult.data ?? []) as { slug: string; name: string }[]
  const cityName = (slug: string) => cities.find((c) => c.slug === slug)?.name ?? slug

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <MarketplaceHero
          eyebrow="Gig board"
          title="Gigs that come with an audience"
          subtitle="Open slots from real organisers. Apply with your EventLinqs profile: your shows, your following, and the exact tickets your sharing sold travel with every application."
          citySlug={filters.citySlug ?? 'geelong'}
        />

        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <GigFilters cities={cities} />
            <Link
              href="/dashboard/gigs"
              className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
            >
              Post a gig
            </Link>
          </div>

          {gigs.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-ink-200 bg-white px-6 py-14 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">
                Nothing here yet
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-ink-900">
                No open gigs match those filters.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-ink-600">
                Widen the filters, or set yourself as available for bookings on your performer
                profile and you hear the moment a matching gig lands.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/gigs"
                  className="inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
                >
                  All open gigs
                </Link>
                <Link
                  href="/artist/dashboard"
                  className="inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-5 text-sm font-semibold text-ink-900 transition-colors hover:border-gold-800"
                >
                  Your performer profile
                </Link>
              </div>
            </div>
          ) : (
            <ul role="list" className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {gigs.map((gig) => (
                <li key={gig.id}>
                  <GigCard gig={gig} cityName={cityName(gig.city_slug)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

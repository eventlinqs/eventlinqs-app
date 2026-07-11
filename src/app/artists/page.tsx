import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Ticket, GraduationCap } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { isPerformanceType, PERFORMANCE_TYPE_LABELS } from '@/lib/marketplace/gigs'
import {
  fetchDirectoryArtists,
  fetchDrawTotalsForArtists,
  type DirectoryFilters as Filters,
} from '@/lib/marketplace/showcase'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { MarketplaceHero } from '@/components/marketplace/marketplace-hero'
import { DirectoryFilters } from '@/components/marketplace/directory-filters'
import { OrganiserAvatar } from '@/components/media/OrganiserAvatar'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Find performers | EventLinqs',
  description:
    'Australian performers with proof of draw: real attributed ticket sales, real lineup history, and showcase videos, city by city.',
  alternates: { canonical: '/artists' },
}

type SearchParams = Promise<{
  city?: string
  type?: string
  available?: string
  mentor?: string
  sort?: string
}>

/**
 * The public performer directory (flag artist_showcase): where an organiser
 * FINDS talent. Every card is a working link to the performer profile; draw
 * numbers show only with the performer's consent and are always measured.
 */
export default async function PerformerDirectoryPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  if (!(await isFeatureEnabled('artist_showcase'))) notFound()

  const raw = await searchParams
  const filters: Filters = {
    citySlug: raw.city && /^[a-z0-9-]{2,60}$/.test(raw.city) ? raw.city : null,
    performanceType: raw.type && isPerformanceType(raw.type) ? raw.type : null,
    availableOnly: raw.available === '1',
    mentorOnly: raw.mentor === '1',
  }

  const admin = createAdminClient()
  const [artists, citiesResult] = await Promise.all([
    fetchDirectoryArtists(admin, filters),
    admin.from('cities').select('slug, name').order('tier').order('name'),
  ])
  const cities = (citiesResult.data ?? []) as { slug: string; name: string }[]
  const cityName = (slug: string | null) => cities.find((c) => c.slug === slug)?.name ?? null

  const draw = await fetchDrawTotalsForArtists(admin, artists.map((a) => a.id))
  const rows = artists.map((a) => ({ artist: a, draw: draw.get(a.id) ?? null }))
  if (raw.sort === 'draw') {
    rows.sort((x, y) => (y.draw?.tickets ?? 0) - (x.draw?.tickets ?? 0))
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <MarketplaceHero
          eyebrow="Performers"
          title="Talent with the numbers to prove it"
          subtitle="Every performer profile carries real credits and, with their consent, the exact tickets their sharing sold. Book on the platform that already sells your tickets."
          citySlug={filters.citySlug ?? 'melbourne'}
        />

        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <DirectoryFilters cities={cities} />

          {rows.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-ink-200 bg-white px-6 py-14 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-800">
                No matches
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold text-ink-900">
                No performers match those filters yet.
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-ink-600">
                Widen the filters, or if that performer is you, set up your profile: it takes a
                minute and your numbers build from your first tagged show.
              </p>
              <Link
                href="/artist/dashboard"
                className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
              >
                Set up your performer profile
              </Link>
            </div>
          ) : (
            <ul role="list" className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map(({ artist, draw: totals }) => (
                <li key={artist.id}>
                  <Link
                    href={`/artists/${artist.slug}`}
                    className="group flex min-h-[44px] flex-col rounded-xl border border-ink-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg"
                  >
                    <div className="flex items-center gap-4">
                      <OrganiserAvatar src={artist.image_url} name={artist.name} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-display text-lg font-bold text-ink-900">
                          {artist.name}
                        </p>
                        <p className="truncate text-sm text-ink-600">
                          {[
                            artist.performance_types
                              .map((t) => PERFORMANCE_TYPE_LABELS[t])
                              .slice(0, 2)
                              .join(', '),
                            cityName(artist.city_slug),
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Performer'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-200/70 pt-3">
                      {artist.available_for_booking && (
                        <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
                          Open to bookings
                        </span>
                      )}
                      {artist.mentor_open && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                          <GraduationCap className="h-3.5 w-3.5" aria-hidden />
                          Mentoring
                        </span>
                      )}
                      {artist.draw_consent && totals && totals.tickets > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-800">
                          <Ticket className="h-3.5 w-3.5" aria-hidden />
                          {totals.tickets} tickets driven
                        </span>
                      )}
                    </div>
                  </Link>
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

import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { loadHomeUpcoming } from '@/lib/events/home-queries'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { discoveryData } from '@/lib/events/discovery-data'
import type { LedgerRow } from '@/lib/events/ledger-data'
import { getAllCities, getCity } from '@/lib/cities/data'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { HeroMedia } from '@/components/media/HeroMedia'
import { CityGuide } from './city-guide'

/**
 * The city guide as a whole page: the header, the guide for ONE city, the footer (the city-first directive of
 * 1 November 2026). The home renders it for the reference city, every /city/[slug] for its own; one component, no
 * city written into it. Every listed night is read once and handed over, so the guide can widen to nearby places by
 * distance when the visitor chooses, without another request.
 */
const QUICK = ['geelong', 'melbourne', 'ballarat', 'bendigo'] as const

export async function CityGuideScreen({
  citySlug,
  heroImage,
  after = null,
}: {
  citySlug: string
  /** The city's own photograph (src/lib/images/city-photo.ts), asked for by the page itself. */
  heroImage: string | null
  after?: ReactNode
}) {
  const city = getCity(citySlug)
  if (!city) return null
  const now = new Date()
  const rows = (await withVenuePhotos(await loadHomeUpcoming(createPublicClient(), now.toISOString(), 1000))) as LedgerRow[]
  const data = await discoveryData(rows, now)
  const quickCities = QUICK.map((s) => getCity(s)).filter((c): c is NonNullable<typeof c> => c !== null)
  const allCities = getAllCities()
    .filter((c) => !c.slug.includes('-') || c.tier === 1)
    .map((c) => ({ slug: c.slug, name: c.name, state: c.state }))

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main>
        {/* The city's own photograph, compact so the city, the dates and the first events stay on a phone's first
            screen (the directive: the directory comes up high); the only place on this page text sits on a photo. */}
        <section aria-label={`What's on in ${city.name}`} className="relative isolate overflow-hidden bg-[var(--color-navy-950)]">
          {heroImage ? <HeroMedia image={heroImage} alt={`${city.name}, ${city.state}`} objectPosition="50% 45%" /> : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-navy-950)]/85 via-[var(--color-navy-950)]/45 to-transparent" aria-hidden="true" />
          <div className="relative mx-auto flex h-48 max-w-7xl flex-col justify-end px-4 pb-5 sm:px-6 md:h-72 md:pb-8 lg:px-8">
            <p className="font-display text-xs font-bold uppercase tracking-widest text-[var(--brand-accent)]">
              <Link href="/cities" className="hover:underline">Australia</Link>
              <span aria-hidden="true"> / </span>
              {city.state}
              <span aria-hidden="true"> / </span>
              {city.name}
            </p>
            <h1 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              What&rsquo;s on in {city.name}
            </h1>
          </div>
        </section>
        <CityGuide
          city={{ slug: city.slug, name: city.name, state: city.state, lat: city.latitude, lng: city.longitude }}
          quickCities={quickCities.map((c) => ({ slug: c.slug, name: c.name }))}
          allCities={allCities}
          rows={data.rows}
          featured={data.featured}
          days={data.days}
        />
        {after}
      </main>
      <SiteFooter />
    </div>
  )
}

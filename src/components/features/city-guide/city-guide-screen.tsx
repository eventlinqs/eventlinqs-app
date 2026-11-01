import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { loadHomeUpcoming } from '@/lib/events/home-queries'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { discoveryData } from '@/lib/events/discovery-data'
import type { LedgerRow } from '@/lib/events/ledger-data'
import { getAllCities, getCity } from '@/lib/cities/data'
import type { ReactNode } from 'react'
import { CityGuide } from './city-guide'
import { CityHeroSlider, SLIDER_MINIMUM } from './city-hero-slider'

/**
 * The city guide as a whole page: the header (its city chip names THIS city), the guide for ONE city, the footer (the
 * city-first directive of 1 November 2026; Lawal's structure, C:\dev\DESIGN\CITY-FIRST-1NOV\structure-geelong-*.png).
 * The home renders it for the reference city, every /city/[slug] for its own; one component, no city written into it.
 * The page opens on 'What's on in <city>' on the canvas, with the rotating slider above it ONLY where the city holds at
 * least three nights this fortnight with a rights recorded photograph (the CONTROLLER's 16:41 (3)); never a placeholder.
 * Every listed night is read once and handed over, so the guide can widen to nearby places by distance when the
 * visitor chooses, without another request.
 */
const QUICK = ['geelong', 'melbourne', 'ballarat', 'bendigo'] as const
const STATE_NAMES: Record<string, string> = {
  VIC: 'Victoria', NSW: 'New South Wales', QLD: 'Queensland', WA: 'Western Australia', SA: 'South Australia',
  TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

export async function CityGuideScreen({ citySlug, after = null }: { citySlug: string; after?: ReactNode }) {
  const city = getCity(citySlug)
  if (!city) return null
  const now = new Date()
  const rows = (await withVenuePhotos(await loadHomeUpcoming(createPublicClient(), now.toISOString(), 1000))) as LedgerRow[]
  const data = await discoveryData(rows, now)
  const quickCities = QUICK.map((s) => getCity(s)).filter((c): c is NonNullable<typeof c> => c !== null)
  const every = getAllCities()
  const allCities = every.filter((c) => !c.slug.includes('-') || c.tier === 1).map((c) => ({ slug: c.slug, name: c.name, state: c.state }))
  const stateCityNames = every.filter((c) => c.state === city.state).map((c) => c.name.toLowerCase())
  const name = city.name.toLowerCase()
  const slides = data.featured.filter((e) => (e.venue_city ?? '').toLowerCase().includes(name)).slice(0, 6)

  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader city={{ name: city.name, latitude: city.latitude, longitude: city.longitude }} />
      <main>
        {slides.length >= SLIDER_MINIMUM ? <CityHeroSlider events={slides} cityName={city.name} /> : null}
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 md:pt-8 lg:px-8">
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            What&rsquo;s on in {city.name}
          </h1>
          <p className="mt-1.5 font-display text-base text-[var(--text-secondary)]">
            Choose a city. Discover everything happening there.
          </p>
        </div>
        <CityGuide
          city={{ slug: city.slug, name: city.name, state: city.state, lat: city.latitude, lng: city.longitude }}
          stateName={STATE_NAMES[city.state] ?? city.state}
          stateCityNames={stateCityNames}
          quickCities={quickCities.map((c) => ({ slug: c.slug, name: c.name }))}
          allCities={allCities}
          rows={data.rows}
          days={data.days}
        />
        {after}
      </main>
      <SiteFooter />
    </div>
  )
}

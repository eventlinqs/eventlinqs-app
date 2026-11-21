import Link from 'next/link'
import { ArrowRight, Drama, Gift, Laugh, Moon, Music, PartyPopper, Trophy, Users, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import { createPublicClient } from '@/lib/supabase/public-client'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import { CityNewsletterCapture } from '@/components/features/city/city-newsletter-capture'
import { loadGuideUpcoming } from '@/lib/events/guide-queries'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { discoveryData } from '@/lib/events/discovery-data'
import type { LedgerRow } from '@/lib/events/ledger-data'
import { getCity } from '@/lib/cities/data'
import { inGuideCity } from '@/lib/cities/guide-rows'
import { getSpineCategoryTile, getSpineCity, getSpineHero } from '@/lib/images/spine'
import { getCityPhoto } from '@/lib/images/city-photo'
import { isOwnRow } from '@/lib/events/guide-sections'
import { GET_TICKETS } from '@/lib/events/cta'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'
import { CATEGORY_CIRCLES, SWITCH_CITIES, promoSlides } from '@/lib/home/marketplace'
import { marketGrid } from '@/lib/home/market-cards'
import { MarketBrowse } from './market-browse'
import { PromoBanner } from './promo-banner'

/**
 * THE MARKETPLACE HOME (law 46 (e); the design engine, DESIGN-ENGINE-LOCKED-21NOV.md sections 1 and 2; Lawal's
 * site.html, C:\dev\EVIDENCE\EL-21NOV\nl-design\whats-on; the PM's 13:04 of 21 November 2026). Mostly white, bold type,
 * gold accents: the white header, the promo banner, the category circles, 'Browsing events in <city>' with its tabs and
 * a grid of cards to save and share, See more, Don't miss, Explore by city, the city's weekly guide, and Sell tickets.
 *
 * Every night is the city guide's own read (loadGuideUpcoming, the public visibility rule, test accounts left out) shaped
 * by discoveryData (the lawful photograph rules), for the city's own nights of the next fortnight; nothing here is a
 * placeholder, and a section with nothing real to show is not drawn. The home stays one cached page for everyone: the
 * header is static safe and the visitor's own city is read in the browser.
 */

const CITY_SLUG = 'melbourne'
const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000
const CONTAINER = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
const CITY_BOX = 'relative block aspect-[4/3] overflow-hidden rounded-xl bg-ink-900 lg:aspect-[16/10]'
const SECTION_HEADING = 'font-headline text-2xl font-extrabold tracking-tight text-ink-900 sm:text-[28px]'

const CIRCLE_ICON: Record<string, LucideIcon> = {
  music: Music,
  nightlife: Moon,
  comedy: Laugh,
  festival: PartyPopper,
  sports: Trophy,
  theatre: Drama,
  family: Users,
  'food-drink': UtensilsCrossed,
  free: Gift,
}

export async function MarketplaceHome() {
  const city = getCity(CITY_SLUG)
  if (!city) return null
  const now = new Date()
  const rows = (await withVenuePhotos(await loadGuideUpcoming(createPublicClient(), now))) as LedgerRow[]
  const data = await discoveryData(rows, now)
  const place = { name: city.name, lat: city.latitude, lng: city.longitude }
  const until = now.getTime() + FORTNIGHT_MS
  const cityRows = data.rows.filter((r) => inGuideCity(r, place) && r.ts <= until)
  const grid = marketGrid(cityRows, data.days)
  const dontMiss = pickDontMiss(cityRows)

  const spine = (s: { src: string; objectPosition?: string } | null) => (s ? { src: s.src, position: s.objectPosition } : null)
  const slides = promoSlides(
    { weekend: spine(getSpineHero('supportingCrowd')), free: spine(getSpineCategoryTile('festival')), sell: spine(getSpineHero('organisersStage')) },
    city.name,
  )
  const cities = await Promise.all(
    SWITCH_CITIES.map(async (c) => {
      const s = getSpineCity(c.slug)
      return { ...c, photo: s ? s.src : await getCityPhoto(c.slug), position: s?.objectPosition }
    }),
  )

  return (
    <div className="min-h-screen bg-white">
      <SiteHeader staticSafe city={{ name: city.name, latitude: city.latitude, longitude: city.longitude }} />
      <main className={CONTAINER}>
        <PromoBanner slides={slides} />

        <nav aria-label="Categories" className="mt-8 flex gap-3 overflow-x-auto pb-1 lg:justify-between lg:gap-2">
          {CATEGORY_CIRCLES.map((c) => {
            const Icon = CIRCLE_ICON[c.key] ?? Music
            return (
              <Link
                key={c.key}
                href={c.href}
                prefetch={false}
                className="group flex min-w-[76px] shrink-0 flex-col items-center gap-2.5 rounded-xl font-display text-[13px] font-bold text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 sm:text-sm lg:min-w-[86px]"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-ink-200 bg-white text-ink-900 transition-colors group-hover:border-[var(--brand-accent)] group-hover:bg-gold-100 lg:h-20 lg:w-20">
                  <Icon className="h-7 w-7 lg:h-8 lg:w-8" aria-hidden />
                </span>
                {c.label}
              </Link>
            )
          })}
        </nav>

        <MarketBrowse grid={grid} city={{ slug: city.slug, name: city.name }} guideHref={`/city/${city.slug}`} />

        {dontMiss ? <DontMiss row={dontMiss} /> : null}

        <section aria-labelledby="by-city-heading" className="mt-14">
          <h2 id="by-city-heading" className={SECTION_HEADING}>
            Explore by city
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-3.5 lg:grid-cols-4 lg:gap-5">
            {cities.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/city/${c.slug}`}
                  prefetch={false}
                  className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2"
                >
                  {c.photo ? (
                    <span className={CITY_BOX}>
                      <EventCardMedia src={c.photo} alt={`${c.name}, ${city.state}`} variant="grid-one-two-four" />
                    </span>
                  ) : (
                    // No stored photograph of the city: the navy panel alone; its name is the line below it.
                    <span aria-hidden="true" className={CITY_BOX} />
                  )}
                  <span className="mt-2.5 block font-headline text-lg font-extrabold text-ink-900 group-hover:underline">{c.name}</span>
                  <span className="inline-flex items-center gap-1 font-display text-sm font-bold text-[var(--brand-accent-strong)]">
                    Events this week
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* THE WEEKLY GUIDE, kept from the guide home (the newsletter engine, law 45): the one step subscribe (law 50). */}
        <section aria-label={`${city.name}'s weekly guide`} className="mt-14">
          <div className="max-w-xl rounded-xl border border-ink-200 bg-[var(--surface-1)] p-5 sm:p-6">
            <CityNewsletterCapture cityName={city.name} tone="light" />
          </div>
        </section>

        <section
          aria-labelledby="sell-heading"
          className="mb-16 mt-14 flex flex-col items-start gap-5 rounded-[20px] bg-gold-100 p-7 sm:p-9 lg:flex-row lg:items-center"
        >
          <div className="max-w-2xl">
            <h2 id="sell-heading" className={SECTION_HEADING}>
              Sell tickets on EventLinqs
            </h2>
            <p className="mt-2 font-display text-base font-semibold text-ink-600">
              List free, reach people looking for what to do this weekend, and own every attendee relationship. Paid out after
              your event.
            </p>
          </div>
          <Link
            href="/organisers"
            prefetch={false}
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-ink-900 px-7 font-display text-base font-extrabold text-white transition-colors hover:bg-ink-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 lg:ml-auto"
          >
            Start selling
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

/**
 * DON'T MISS (site.html): one night, its own photograph with its rights on record (law 18: a lead slot only with a
 * permitted photograph), an organiser's own listing first, then the soonest. None, and the section is not drawn.
 */
export function pickDontMiss(rows: readonly DirectoryRow[]): DirectoryRow | null {
  const withPhoto = rows.filter((r) => r.thumb)
  const own = withPhoto.filter((r) => isOwnRow(r)).sort((a, b) => a.ts - b.ts)
  return own[0] ?? [...withPhoto].sort((a, b) => a.ts - b.ts)[0] ?? null
}

function DontMiss({ row }: { row: DirectoryRow }) {
  const when = new Date(`${row.dayKey}T00:00:00Z`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')
  const facts = [row.time ? `${when}, ${row.time}` : when, row.venue].filter(Boolean).join(' · ')
  return (
    <section aria-labelledby="dont-miss-heading" className="mt-14">
      <h2 id="dont-miss-heading" className={SECTION_HEADING}>
        Don&rsquo;t miss
      </h2>
      <Link
        href={row.href}
        prefetch={false}
        className="group mt-4 grid overflow-hidden rounded-[20px] bg-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
      >
        <span className="relative order-1 block aspect-[16/10] md:order-2 md:aspect-auto md:min-h-[320px]">
          <EventCardMedia src={row.thumb as string} alt={row.thumbAlt ?? row.title} variant="guide-big-card" />
        </span>
        <span className="order-2 flex flex-col justify-center gap-3 p-6 md:order-1 md:p-9">
          <span className="font-headline text-2xl font-extrabold leading-tight text-white group-hover:underline md:text-4xl">{row.title}</span>
          {row.teaser ? <span className="line-clamp-3 font-display text-[15px] font-semibold text-white/85">{row.teaser}</span> : null}
          <span className="font-display text-sm font-bold text-[var(--brand-accent)]">{facts}</span>
          <span className="mt-1 inline-flex min-h-12 w-fit items-center gap-2 rounded-full bg-[var(--brand-accent)] px-6 font-display text-base font-extrabold text-[var(--color-navy-950)]">
            {row.free ? 'See details' : GET_TICKETS}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </span>
      </Link>
    </section>
  )
}

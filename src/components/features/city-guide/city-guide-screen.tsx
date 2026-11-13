import { createPublicClient } from '@/lib/supabase/public-client'
import { rowsAGuideCanShow } from '@/lib/cities/guide-rows'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { loadGuideUpcoming } from '@/lib/events/guide-queries'
import { withVenuePhotos } from '@/lib/images/venue-photo-chain'
import { discoveryData } from '@/lib/events/discovery-data'
import type { LedgerRow } from '@/lib/events/ledger-data'
import { getAllCities, getCity, getSuburbsForCity, type CitySlug } from '@/lib/cities/data'
import { cityGuideSubtitle } from '@/lib/cities/guide-subtitle'
import { readGuideCity } from '@/lib/listings/free-week-surface'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { HeroMedia } from '@/components/media/HeroMedia'
import { HeroCaption } from '@/components/media/hero-caption'
import { getCityBanner } from '@/lib/images/city-photo'
import { CityGuide } from './city-guide'
import { HERO_EYEBROW_PLATE } from '@/components/media/hero-photo-scrim'
import { statePageHref } from '@/lib/cities/state-pages'
import { CityNewsletterCapture } from '@/components/features/city/city-newsletter-capture'

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
const MORE_LINK =
  'inline-flex min-h-11 items-center rounded-full border border-[var(--color-ink-200)] bg-white px-4 font-display text-sm font-bold text-[var(--text-primary)] hover:border-[var(--color-ink-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2'
const STATE_NAMES: Record<string, string> = {
  VIC: 'Victoria', NSW: 'New South Wales', QLD: 'Queensland', WA: 'Western Australia', SA: 'South Australia',
  TAS: 'Tasmania', ACT: 'Australian Capital Territory', NT: 'Northern Territory',
}

export async function CityGuideScreen({
  citySlug,
  heroImage,
  after = null,
  scope = 'city',
}: {
  citySlug: string
  /**
   * The city's own photograph (src/lib/images/city-photo.ts), asked for by the page itself (the guard
   * tiles-on-stored-photos, clause 10). Lawal's structure shots say of themselves 'Structural illustration only ... not a
   * proposed replacement for the final visual design', so the heading still comes first, set on the city's photo.
   */
  heroImage: string | null
  after?: ReactNode
  /**
   * 'state': the STATE PAGE (/state/<slug>, the CONTROLLER's 14:10 of 3 November 2026): the same guide over every listed
   * city of citySlug's state, which is then the state's capital and lends its photograph; the state chip is the current
   * page. 'city' (the default): one city, its state chip OPENS the state page (never a scroll on this page).
   */
  scope?: 'city' | 'state'
}) {
  const city = getCity(citySlug)
  if (!city) return null
  // The city's licensed banner where one is kept (Geelong, Ballarat, Bendigo), its credit drawn where its licence asks; else the
  // page's own photo.
  const banner = getCityBanner(city.slug)
  const photo = banner?.src ?? heroImage
  const now = new Date()
  const rows = (await withVenuePhotos(await loadGuideUpcoming(createPublicClient(), now))) as LedgerRow[]
  const data = await discoveryData(rows, now)
  const quickCities = QUICK.map((s) => getCity(s)).filter((c): c is NonNullable<typeof c> => c !== null)
  const every = getAllCities()
  const allCities = every.filter((c) => !c.slug.includes('-') || c.tier === 1).map((c) => ({ slug: c.slug, name: c.name, state: c.state }))
  const stateCityNames = every.filter((c) => c.state === city.state).map((c) => c.name.toLowerCase())
  const name = city.name.toLowerCase()
  const stateName = STATE_NAMES[city.state] ?? city.state
  const onState = scope === 'state'
  const placeName = onState ? stateName : city.name
  // 'Worth going out for' (the 2 November directive, section 3): ORGANISER artwork with its rights on record only, never a
  // venue photograph (image_credit) or a logo; the guide draws it at three or more and the count goes to the gap report.
  const worth = data.featured.filter(
    (e) => (e.venue_city ?? '').toLowerCase().includes(name) && !e.image_credit && e.cover_rights_recorded === true,
  )
  // The suburbs of a tier 1 city (the old page's rule), and the city's free week page only where that page exists.
  const suburbs = city.tier === 1 ? getSuburbsForCity(city.slug as CitySlug) : []
  // Claims open only on the flag (feature_flags.listing_claims; its default and any failed read are OFF), so the organiser
  // block never offers a claim the claim page would refuse (round 2 (d)).
  const claimsOn = await isFeatureEnabled('listing_claims', { client: createPublicClient(), cachedPage: true })
  // A failed read only leaves the link off, and says so (the old city page's own handling).
  const freeWeek = await readGuideCity(city.slug).then(
    (c) => c !== null,
    (err: unknown) => {
      console.error('[city-guide] the free guide could not be read:', err instanceof Error ? err.message : err)
      return false
    },
  )

  return (
    <div className="min-h-screen bg-canvas">
      {/* staticSafe (round 3, the CONTROLLER 19:01): no server sign-in read, so / and /city/[slug] are edge cached as /events is. */}
      <SiteHeader staticSafe city={{ name: city.name, latitude: city.latitude, longitude: city.longitude }} />
      <main>
        {/* The city's own photograph, compact so the city, the dates and the first events stay on a phone's first
            screens (the directive: the directory comes up high); the only place on this page text sits on a photo. */}
        <section aria-label={`What's on in ${placeName}`} className="relative isolate overflow-hidden bg-[var(--color-navy-950)]">
          {photo ? <HeroMedia image={photo} alt={`${city.name}, ${city.state}`} objectPosition={banner?.position ?? '50% 45%'} /> : null}
          <div className="relative mx-auto flex h-60 max-w-7xl flex-col justify-end px-4 pb-6 sm:px-6 md:h-80 md:pb-10 lg:px-8">
            {/* The one shared caption over a photograph, so the heading clears its contrast floor (hero-text-over-a-photograph);
                its TEXT-SIDE wash (the CONTROLLER's 07:12) keeps that floor behind every word and leaves the rest of the photo bare. */}
            <HeroCaption wash="text-side" className="max-w-xl">
              {/* THE EYEBROW ON ITS OWN BACKING (the CONTROLLER's pick B, 00:24 of 4 November): the band is light behind the
                  words, and the small gold line, the one the drive could not prove on the photograph, is dark only behind
                  itself; its separators are drawn, not a slash glyph too thin to measure. No text shadow on the backing. */}
              <p
                data-eyebrow-plate
                className="inline-flex items-center rounded-md px-2 py-0.5 font-display text-xs font-bold uppercase tracking-widest text-[var(--brand-accent)]"
                style={{ background: HERO_EYEBROW_PLATE, textShadow: 'none' }}
              >
                <Link href="/cities" className="-my-3 inline-flex min-h-11 items-center hover:underline">Australia</Link>
                <span aria-hidden="true" className="mx-2 inline-block h-3 w-px bg-current opacity-80" />
                {stateName}
                {onState ? null : (
                  <>
                    <span aria-hidden="true" className="mx-2 inline-block h-3 w-px bg-current opacity-80" />
                    {city.name}
                  </>
                )}
              </p>
              <h1 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                What&rsquo;s on in {placeName}
              </h1>
              {/* Lawal's sentence for every city guide, its own name in it (src/lib/cities/guide-subtitle.ts). */}
              <p className="mt-2 max-w-xl font-display text-base text-white/90 sm:text-lg">{cityGuideSubtitle(placeName)}</p>
              {banner?.credit ? (
                // CC BY-SA 4.0's credit: the author, the source and the licence, small, on the caption's own wash.
                <p data-banner-credit className="mt-3 font-display text-xs text-white/80">
                  Photo:{' '}
                  <a href={banner.page} rel="noopener" className="underline underline-offset-2 hover:text-white">
                    {banner.credit.author}
                  </a>
                  ,{' '}
                  <a href={banner.credit.licenceUrl} rel="license noopener" className="underline underline-offset-2 hover:text-white">
                    {banner.licence}
                  </a>
                </p>
              ) : null}
            </HeroCaption>
          </div>
        </section>
        <CityGuide
          city={{ slug: city.slug, name: city.name, state: city.state, lat: city.latitude, lng: city.longitude }}
          stateName={stateName}
          scope={scope}
          stateHref={statePageHref(city.state)}
          stateCityNames={stateCityNames}
          quickCities={quickCities.map((c) => ({ slug: c.slug, name: c.name }))}
          allCities={allCities}
          // Only the rows this guide's own filter can reach (src/lib/cities/guide-rows.ts): the city's nights and those
          // within the widest distance, or the state's on the state page. The Geelong guide carried 832 rows, 325 its own.
          rows={rowsAGuideCanShow(data.rows, { name: city.name, lat: city.latitude, lng: city.longitude }, scope, stateCityNames)}
          days={data.days}
          worth={worth}
          claimsOn={claimsOn}
          renderedAt={now.getTime()}
        />
        {/* MORE OF THE CITY: the city's own ranked pages, each reached from here (the gate's internal-reachability step,
            21:30 on 1 November 2026: replacing the old city page had orphaned them), and the directive's suburb way in
            (C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md s1). Words only; nothing here is an event. */}
        {/* No 'Browse every event' link any more: /events/browse/<city> is a 301 to this very page (round 3, item 7). */}
        {!onState && (freeWeek || suburbs.length > 0) ? (
        <section aria-label={`More of ${city.name}`} className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <h2 className="type-rail-heading font-headline font-extrabold text-[var(--text-primary)]">More of {city.name}</h2>
          {/* Drawn only when it holds the free week link: an empty list left a gap under the heading (Canberra, read on
              www 8 November 2026, beside Melbourne's). */}
          {freeWeek ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              <li>
                <Link href={`/free/${city.slug}/this-week`} className={MORE_LINK}>
                  Free in {city.name} this week
                </Link>
              </li>
            </ul>
          ) : null}
          {suburbs.length > 0 ? (
            <>
              <h3 className="mt-6 font-display text-sm font-extrabold uppercase tracking-wider text-[var(--text-muted)]">By suburb</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {suburbs.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/city/${city.slug}/${s.slug.startsWith(`${city.slug}-`) ? s.slug.slice(city.slug.length + 1) : s.slug}`} className={MORE_LINK}>
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        ) : null}
        {/* THE WEEKLY GUIDE, ASKED FOR ON THE GUIDE ITSELF (the PM's 18:16 of 13 November 2026, item 3): the same block the
            community pages use, after the guide's sections, on every city guide and never on a state page (the guide is
            per city). Its heading and line are the consent wording recorded (src/lib/consent/wording.ts); the address's
            owner confirms before the first edition. Below the fold, so the hero keeps the paint. */}
        {!onState ? (
          <section aria-label={`${city.name}'s weekly guide`} className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
            <div className="max-w-xl rounded-xl border border-ink-200 bg-[var(--surface-1)] p-5 sm:p-6">
              <CityNewsletterCapture cityName={city.name} tone="light" />
            </div>
          </section>
        ) : null}
        {after}
      </main>
      <SiteFooter />
    </div>
  )
}

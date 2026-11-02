'use client'

import Link, { useLinkStatus } from 'next/link'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpRight, Briefcase, CalendarDays, ChevronDown, Drama, GraduationCap, Hammer, HeartHandshake, HeartPulse, Laugh, MapPin, Moon, Music,
  Palette, PartyPopper, Search, Sparkles, Store, Trophy, Users, UtensilsCrossed, X,
} from 'lucide-react'
import { OUR_CHECKOUT_LABEL, OUR_REGISTRATION_LABEL, OUTBOUND_LABEL, WALK_IN_LABEL, type DirectoryRow } from '@/lib/events/whats-on-directory'
import { GET_TICKETS, ROW_FREE_WITH_BOOKING } from '@/lib/events/cta'
import type { EventCardData } from '@/components/features/events/event-card'
import { byMonth, foldListings, guideSections, inRange, listingKey, PAGE, whenLine, type Entry, type Range } from '@/lib/events/guide-sections'
import { EventCardMedia } from '@/components/media/EventCardMedia'

/**
 * THE CITY GUIDE (the city-first directive of 1 November 2026, C:\dev\DESIGN\CITY-FIRST-1NOV, sections 1 and 6). One
 * component for every city, nothing written for one city alone. It answers, in this order: WHERE (the city, chosen
 * first, never mixed; nearby places only when the visitor widens on purpose), WHAT (search in the city, the categories
 * the city actually holds, with their counts) and WHEN (Today, Tomorrow, This weekend, Next 7 days, Choose dates).
 * Then Featured (Ledger cards, authorised photographs only), Happening this week, and the complete calendar after it.
 * Every row: the time where one is held, the title, the venue, the price and where it is booked.
 */

export type GuideCity = { slug: string; name: string; state: string; lat: number; lng: number }
type When = Range
type Days = { todayKey: string; tomorrowKey: string; weekendKeys: string[]; weekKeys: string[] }
type Price = 'all' | 'free' | 'paid'

/** The browse list's ranges (round 3, item 5, Lawal 17:10): 'Next 3 months' is the default; 'All dates' hides nothing. */
const WHEN: { key: When; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'three', label: 'Next 3 months' },
  { key: 'all', label: 'All dates' },
]
const RADII = [0, 25, 50] as const
const PRICES: { key: Price; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free' },
  { key: 'paid', label: 'Paid' },
]
/** 'Worth going out for' is drawn only at three or more rights recorded organiser artworks (the 2 November directive, 3). */
export const WORTH_MINIMUM = 3
/*
 * A chip row that scrolls sideways on a phone shows that it does: its right edge fades, so the cut chip reads as 'more'
 * (the directive, C: 'chip rows cut at the right edge with no cue that they scroll'). From a small tablet up they wrap.
 */
const SCROLL_ROW =
  'relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [mask-image:linear-gradient(to_right,black_82%,transparent)] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none]'
const SELECT =
  'min-h-11 rounded-xl border border-[var(--color-ink-200)] bg-white px-3 font-display text-base font-semibold normal-case tracking-normal text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]'
const ORGANISER_LINK =
  'block min-h-11 rounded-xl border border-[var(--surface-2)] bg-[var(--color-canvas)] p-4 transition-colors hover:border-[var(--color-ink-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]'
/** The Explore tiles' order, by what a visitor looks for first (Lawal, 1 November 2026, 19:17, (3)). */
export const EXPLORE_ORDER: readonly string[] = ['music', 'sports', 'comedy', 'nightlife', 'markets', 'food-drink', 'family', 'arts-community']

/** One icon per category, read from the slug's words so a new category still gets a sensible one. */
function iconFor(slug: string) {
  const s = slug.toLowerCase()
  if (s.includes('music') || s.includes('concert')) return Music
  if (s.includes('night') || s.includes('dj')) return Moon
  if (s.includes('comedy')) return Laugh
  if (s.includes('theatre') || s.includes('perform')) return Drama
  if (s.includes('festival') || s.includes('cultur')) return PartyPopper
  if (s.includes('sport')) return Trophy
  if (s.includes('food') || s.includes('drink')) return UtensilsCrossed
  if (s.includes('market')) return Store
  if (s.includes('art') || s.includes('exhibit')) return Palette
  if (s.includes('family') || s.includes('child') || s.includes('kid')) return Users
  if (s.includes('community')) return HeartHandshake
  if (s.includes('class') || s.includes('workshop')) return Hammer
  if (s.includes('business') || s.includes('network')) return Briefcase
  if (s.includes('health') || s.includes('well')) return HeartPulse
  if (s.includes('educat') || s.includes('talk')) return GraduationCap
  return Sparkles
}

/**
 * A CHOSEN DATE IS A ZONE-LESS CALENDAR DAY, NOT AN INSTANT: the date field gives 'YYYY-MM-DD', the day the visitor
 * picked, with no time and no zone. It is read at noon UTC and printed in UTC so it names that same day on every
 * reader's device; it never formats an event's start (those go through formatEventDateShort in the event's own zone).
 */
const CHOSEN_DAY_IS_A_WALL_CALENDAR_DAY_ZONE = 'UTC'

/** '7 November' for a chosen date key (YYYY-MM-DD), read as that calendar day. */
function dateWords(key: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', timeZone: CHOSEN_DAY_IS_A_WALL_CALENDAR_DAY_ZONE }).format(new Date(`${key}T12:00:00Z`))
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(bLat - aLat)
  const dLng = r(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function chip(on: boolean): string {
  return `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 font-display text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 ${
    on
      ? 'border-[var(--color-ink-900)] bg-[var(--color-ink-900)] text-white'
      : 'border-[var(--color-ink-200)] bg-white text-[var(--text-primary)] hover:border-[var(--color-ink-400)]'
  }`
}

export function CityGuide({
  city,
  quickCities,
  allCities,
  rows,
  days,
  stateName,
  stateCityNames,
  claimsOn = false,
}: {
  city: GuideCity
  quickCities: readonly { slug: string; name: string }[]
  allCities: readonly { slug: string; name: string; state: string }[]
  rows: readonly DirectoryRow[]
  days: Days
  /** The city's state in words ('Victoria'), the first chip: every night in that state's listed cities. */
  stateName: string
  /** The listed cities of that state, lower case, matched against a row's city as the city itself is. */
  stateCityNames: readonly string[]
  /**
   * 'Worth going out for' (Lawal's Geelong reference directive of 2 November 2026, section 3,
   * C:\dev\DESIGN\CITY-FIRST-1NOV\GEELONG-REFERENCE-DIRECTIVE-2NOV.md): ONLY nights whose ORGANISER artwork has its
   * rights on record; the section is drawn at WORTH_MINIMUM or more, never padded, never a venue photo or a logo.
   */
  worth?: readonly EventCardData[]
  /**
   * Whether listing claims are open (feature_flags.listing_claims). The organiser block offers a claim ONLY then: the
   * claim pages answer 404 while it is off, so the offer would be false (round 2 (d), Lawal 2 November 12:05).
   */
  claimsOn?: boolean
}) {
  const [q, setQ] = useState('')
  const [when, setWhen] = useState<When>('three')
  const [limit, setLimit] = useState(PAGE)
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('all')
  const [suburb, setSuburb] = useState('all')
  const [price, setPrice] = useState<Price>('all')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(0)
  const [cities, setCities] = useState(false)
  const [wholeState, setWholeState] = useState(false)

  const name = city.name.toLowerCase()
  const inCity = (r: DirectoryRow) => r.cityKey.includes(name)
  const near = (r: DirectoryRow) =>
    radius > 0 && r.lat !== null && r.lng !== null && km(city.lat, city.lng, r.lat, r.lng) <= radius
  const inState = (r: DirectoryRow) => stateCityNames.some((n) => r.cityKey.includes(n))
  const here = rows.filter((r) => (wholeState ? inState(r) : inCity(r) || near(r)))
  const placeName = wholeState ? stateName : city.name

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matchesQ = (r: DirectoryRow) =>
    words.every((w) => `${r.title} ${r.venue ?? ''} ${r.category ?? ''} ${r.suburb ?? ''}`.toLowerCase().includes(w))
  // Friday to Sunday (the 2 November directive, section 4): the platform's one weekend, every day of it from today on
  // (discoveryDays); the 'This weekend' chip and section 4 read the same days, so the page never says two weekends.
  const weekendDays = days.weekendKeys
  const matchesWhen = (r: DirectoryRow) => inRange(r, when, { ...days, weekendKeys: weekendDays }, date)
  const matchesPrice = (r: DirectoryRow, p: Price) => p === 'all' || (p === 'free' ? r.free : !r.free)
  const shown = here.filter(
    (r) =>
      matchesQ(r) &&
      matchesWhen(r) &&
      (category === 'all' || r.categorySlug === category) &&
      (suburb === 'all' || (r.suburb ?? '') === suburb) &&
      matchesPrice(r, price),
  )

  // Section 2: the city's own categories, each count read from its real rows, a tile only where events exist, in
  // Lawal's order (music, sport, comedy, nightlife, markets, food and drink, family, arts), the rest by count, community
  // last (the directive, section 2).
  // A tile counts EVENTS, never dates (the CONTROLLER's 09:13 (3)): a weekly session is one event however many nights.
  const counts = new Map<string, { label: string; n: number }>()
  for (const [slug, label, n] of eventsByCategory(here)) counts.set(slug, { label, n })
  const rank = (slug: string) => {
    if (slug === 'community') return EXPLORE_ORDER.length + 1
    const i = EXPLORE_ORDER.indexOf(slug)
    return i < 0 ? EXPLORE_ORDER.length : i
  }
  const tiles = [...counts.entries()].sort(
    (a, b) => rank(a[0]) - rank(b[0]) || b[1].n - a[1].n || a[1].label.localeCompare(b[1].label),
  )

  // Round 3's sections, read once from the city's rows; 'now' is the city's own today at noon, so server and browser agree.
  const sections = guideSections(here, { ...days, weekendKeys: weekendDays }, Date.parse(`${days.todayKey}T12:00:00Z`))

  // Section 5's suburb choice: the suburbs this city's own rows name.
  const suburbs = [...new Set(here.map((r) => r.suburb).filter((s): s is string => Boolean(s)))].sort((a, b) => a.localeCompare(b))
  const filtered = when !== 'three' || category !== 'all' || suburb !== 'all' || price !== 'all' || words.length > 0
  // The list: unfiltered, every listing in the next 3 months no section showed; filtered, the whole answer. One entry each.
  const list = filtered ? foldListings(shown, here) : sections.rest
  const narrowed = shown.length !== here.length || listingCount(shown) !== listingCount(here)
  const toList = () => document.getElementById('city-calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const clear = () => {
    setWhen('three')
    setCategory('all')
    setSuburb('all')
    setPrice('all')
    setQ('')
    setDate('')
  }

  return (
    <div className="bg-canvas pb-28 md:pb-12">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8 md:pt-6">
        {/* 1 CITY DISCOVERY: the city chosen first, switched in one tap; search in the city; the dates people plan in. */}
        <div className={SCROLL_ROW} role="group" aria-label="Choose a city">
          <SnapChip on={wholeState} aria-pressed={wholeState} onSelect={() => setWholeState(!wholeState)}>
            {stateName}
          </SnapChip>
          {quickCities.map((c) =>
            c.slug === city.slug ? (
              // The city you are in: a tap takes you to its events (Lawal 17:22: 'every click ... must work').
              <SnapChip
                key={c.slug}
                on={!wholeState}
                next
                aria-pressed={!wholeState}
                onSelect={() => {
                  setWholeState(false)
                  toList()
                }}
              >
                {c.name}
              </SnapChip>
            ) : (
              <SnapLink key={c.slug} href={`/city/${c.slug}`} className={`relative ${chip(false)}`} label={c.name} />
            ),
          )}
          <SnapChip on={false} next={false} onSelect={() => setCities(true)} aria-haspopup="dialog">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Change city
          </SnapChip>
        </div>

        {/* SHORTER ON A PHONE (Lawal, 2 November 2026, 09:00, refinement 3): the whole-country search sits beside the box,
            not on a line of its own; the dates, Free and the distance share one row below. */}
        <div className="mt-4 flex items-center gap-3">
          <label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full border border-[var(--color-ink-200)] bg-white px-4 focus-within:ring-2 focus-within:ring-[var(--color-gold-400)]">
            <Search className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search events, venues, suburbs in ${placeName}`}
              aria-label={`Search events in ${placeName}`}
              className="min-w-0 flex-1 bg-transparent font-display text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </label>
          <SnapLink
            href={`/events${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`}
            aria-label="Search all of Australia"
            className="relative inline-flex min-h-11 shrink-0 items-center font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-4"
            label="All of Australia"
            plain
          />
        </div>

        <div className={`mt-3 ${SCROLL_ROW}`}>
        <div className="flex shrink-0 gap-2" role="group" aria-label="When">
          {WHEN.map((w) => (
            <SnapChip key={w.key} on={when === w.key} aria-pressed={when === w.key} onSelect={() => setWhen(when === w.key ? 'three' : w.key)}>
              {w.label}
            </SnapChip>
          ))}
          {/* 'Choose dates' reads as a chip; the date field covers it and opens the browser's own calendar on a tap. */}
          <label className={`relative ${chip(when === 'date')}`}>
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span>{when === 'date' && date ? dateWords(date) : 'Pick dates'}</span>
            <input
              type="date"
              value={date}
              min={days.todayKey}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker?.()
                } catch {
                  // A browser that will not open its picker from script still takes the tap on the field itself.
                }
              }}
              onChange={(e) => {
                setDate(e.target.value)
                setWhen(e.target.value ? 'date' : 'three')
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Choose a date"
            />
          </label>
        </div>
        <div className="flex shrink-0 gap-2" role="group" aria-label="Price and area">
          <button type="button" aria-pressed={price === 'free'} onClick={() => setPrice(price === 'free' ? 'all' : 'free')} className={chip(price === 'free')}>
            Free
          </button>
          {/* The distance is ONE chip showing the choice in force; the phone's own compact list opens on a tap. */}
          {wholeState ? null : (
            <label className={`relative ${chip(radius > 0)}`}>
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <span>{radius === 0 ? `In ${city.name}` : `Within ${radius} km`}</span>
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
              <select
                aria-label="Distance"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value) as (typeof RADII)[number])}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {RADII.map((r) => (
                  <option key={r} value={r}>
                    {r === 0 ? `In ${city.name}` : `Within ${r} km`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        </div>

        {/* ROUND 3, LOCKED BY LAWAL (2 November 2026, 17:00 to 17:10; ROUND3-DIRECTIVE-2NOV.md): the sections, chosen by
            stated rules in src/lib/events/guide-sections.ts, photo first then date, never paid; no listing twice on the
            page. When the visitor filters, the list below is the whole answer and the sections step aside. */}
        {!filtered && sections.big.length > 0 ? (
          <section aria-label={`Big nights in ${placeName}`} className="mt-12">
            <RailHead title="Big nights" onAll={() => { setWhen('all'); toList() }} />
            <p className="mt-1 font-display text-sm text-[var(--text-secondary)]">
              The biggest shows coming to {placeName}, picked by our editors, never paid.
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              {sections.big.map((e) => (
                <li key={e.row.id}>
                  <BigCard e={e} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!filtered && sections.announced.length > 0 ? (
          <section aria-label={`Just announced in ${placeName}`} className="mt-12">
            <RailHead title="Just announced" />
            <CardRail entries={sections.announced} />
          </section>
        ) : null}
        {!filtered && sections.weekend.length > 0 ? (
          <section aria-label={`This weekend in ${placeName}`} className="mt-12">
            <RailHead title="This weekend" onAll={() => { setWhen('weekend'); toList() }} />
            <CardRail entries={sections.weekend} />
          </section>
        ) : null}
        {!filtered && sections.free.length > 0 ? (
          <section aria-label={`Free and community in ${placeName}`} className="mt-12">
            <RailHead title="Free and community" onAll={() => { setPrice('free'); toList() }} />
            <ul className="relative mt-3 overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white">
              {sections.free.map((e) => (
                <li key={e.row.id} className="border-b border-[var(--surface-2)] last:border-b-0">
                  <Row e={e} cityName={name} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {!filtered && sections.soon.length > 0 ? (
          <section aria-label={`Further ahead in ${placeName}`} className="mt-12">
            <RailHead title="Further ahead" onAll={() => { setWhen('all'); toList() }} />
            <ul className="relative mt-3 overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white">
              {sections.soon.map((e) => (
                <li key={e.row.id} className="border-b border-[var(--surface-2)] last:border-b-0">
                  <Row e={e} cityName={name} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* EXPLORE BY INTEREST, after the sections: Big nights leads the page (the CONTROLLER 22:16 (1), the locked brief item 1). */}
        {tiles.length > 0 ? (
          <section aria-label={`Explore ${placeName}`} className="mt-10">
            <SectionHead eyebrow={`Explore ${placeName}`} title="Discover your kind of event" />
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[...tiles, ['all', { label: 'All events', n: eventCount(here) }] as const].map(([slug, c]) => {
                const Icon = slug === 'all' ? CalendarDays : iconFor(slug)
                const on = slug !== 'all' && category === slug
                return (
                  <li key={slug}>
                    <button
                      type="button"
                      aria-pressed={slug === 'all' ? undefined : on}
                      onClick={() => {
                        setCategory(on || slug === 'all' ? 'all' : slug)
                        toList()
                      }}
                      className={`guide-tile ${
                        on ? 'border-[var(--color-ink-900)] bg-[var(--color-ink-900)] text-white' : 'border-[var(--surface-2)] bg-white text-[var(--text-primary)] hover:border-[var(--color-ink-400)]'
                      }`}
                    >
                      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${on ? 'bg-white/10' : 'bg-[var(--color-gold-100)]'}`}>
                        <Icon className={`h-5 w-5 ${on ? 'text-[var(--brand-accent)]' : 'text-[var(--brand-accent-strong)]'}`} aria-hidden="true" />
                      </span>
                      <span className="font-display text-base font-bold leading-tight">{c.label}</span>
                      <span className={`font-display text-xs font-semibold ${on ? 'text-white/80' : 'text-[var(--text-muted)]'}`}>
                        {c.n} {c.n === 1 ? 'event' : 'events'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}

        {/* THE BROWSE LIST: the next 3 months by default (rule (b)), one entry per listing under month headings, 20 at a
            time; 'All dates' reaches every listed night (rule (a)). */}
        <section id="city-calendar" aria-label={`All events in ${placeName}`} className="mt-12 scroll-mt-24">
          <SectionHead eyebrow="Every event, by month" title={`All events in ${placeName}`} />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT}>
                <option value="all">Every category</option>
                {tiles.map(([slug, c]) => (
                  <option key={slug} value={slug}>
                    {c.label} ({c.n})
                  </option>
                ))}
              </select>
            </label>
            {/* A suburb choice only where the city's own rows name two or more suburbs: a filter with one option is noise. */}
            {suburbs.length >= 2 ? (
              <label className="flex flex-col gap-1 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Suburb
                <select value={suburb} onChange={(e) => setSuburb(e.target.value)} className={SELECT}>
                  <option value="all">Every suburb</option>
                  {suburbs.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="flex flex-col gap-1 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Price
              <div className="flex gap-2" role="group" aria-label="Price">
                {PRICES.map((p) => (
                  <button key={p.key} type="button" aria-pressed={price === p.key} onClick={() => setPrice(p.key)} className={chip(price === p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-display text-sm font-semibold text-[var(--text-muted)]" aria-live="polite">
              {countLine(shown, narrowed ? here : null)} coming up in{' '}
              {radius && !wholeState ? `${city.name} and within ${radius} km` : placeName}
            </p>
            {filtered ? (
              <button
                type="button"
                onClick={clear}
                className="inline-flex min-h-11 items-center gap-1 font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-4"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            ) : null}
          </div>
          {list.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-[var(--surface-2)] bg-white px-5 py-8 font-display text-base text-[var(--text-secondary)]">
              {filtered
                ? `Nothing in ${placeName} matches these choices yet. Try another date or suburb, or clear the filters.`
                : `Every event in ${placeName} for the next 3 months is shown above. All dates reaches further.`}
            </p>
          ) : (
            <>
              <MonthList entries={list.slice(0, limit)} cityName={name} />
              {list.length > limit ? (
                <button
                  type="button"
                  onClick={() => setLimit(limit + PAGE)}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[var(--color-ink-200)] bg-white px-5 font-display text-sm font-bold text-[var(--text-primary)] hover:border-[var(--color-ink-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
                >
                  Show more ({list.length - limit} more {list.length - limit === 1 ? 'event' : 'events'})
                </button>
              ) : null}
            </>
          )}
        </section>

        {/* 6 HOSTING AN EVENT: existing routes only, and only offers the platform really makes (a claim only while claims are open). */}
        <section aria-label={`Hosting an event in ${city.name}?`} className="mt-12 rounded-2xl border border-[var(--surface-2)] bg-white p-5 shadow-[var(--shadow-card)] md:p-8">
          <SectionHead eyebrow="For organisers" title={`Hosting an event in ${city.name}?`} />
          <ul className={`mt-4 grid grid-cols-1 gap-3 ${claimsOn ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {claimsOn ? (
              <li>
                <a href="#city-calendar" className={ORGANISER_LINK}>
                  <span className="font-display text-base font-bold text-[var(--text-primary)]">Claim your listing</span>
                  <span className="mt-1 block font-display text-sm text-[var(--text-secondary)]">
                    Find your event in the list above, open it and choose to claim it.
                  </span>
                </a>
              </li>
            ) : null}
            <li>
              <Link href="/submit-event" className={ORGANISER_LINK}>
                <span className="font-display text-base font-bold text-[var(--text-primary)]">List your event</span>
                <span className="mt-1 block font-display text-sm text-[var(--text-secondary)]">Add a night that is not here yet.</span>
              </Link>
            </li>
            <li>
              <Link href="/organisers" className={ORGANISER_LINK}>
                <span className="font-display text-base font-bold text-[var(--text-primary)]">Sell tickets on EventLinqs</span>
                <span className="mt-1 block font-display text-sm text-[var(--text-secondary)]">Your own checkout, your own buyers.</span>
              </Link>
            </li>
          </ul>
        </section>
      </div>

      {cities ? (
        <CitySheet cities={allCities} current={city.slug} onClose={() => setCities(false)} />
      ) : null}
    </div>
  )
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-display text-xs font-extrabold uppercase tracking-widest text-[var(--brand-accent-strong)]">{eyebrow}</p>
      <h2 className="type-rail-heading mt-1 font-headline font-extrabold text-[var(--text-primary)]">{title}</h2>
    </div>
  )
}

/**
 * A LINK THAT ANSWERS THE TAP AT ONCE (round 3, item 0; Lawal 17:22). Measured on live: a city page took about 2 s to
 * arrive with nothing changing on screen, so a tap read as dead. Inside its Link, this draws the selected, busy state the
 * moment the navigation starts (Next's useLinkStatus, its documented answer for slow navigations) until the page lands.
 */
function TapAnswer({ label, plain = false, going = false }: { label: string; plain?: boolean; going?: boolean }) {
  const { pending } = useLinkStatus()
  return (
    <>
      {label}
      {pending || going ? (
        <span
          className={`absolute inset-0 flex items-center justify-center gap-2 ${plain ? 'bg-[var(--color-canvas)] text-[var(--text-primary)]' : 'rounded-full bg-[var(--color-ink-900)] text-white'}`}
        >
          <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
          <span aria-hidden="true">{label}</span>
          <span className="sr-only">Opening {label}</span>
        </span>
      ) : null}
    </>
  )
}

/**
 * A CHIP THAT SNAPS ON TOUCH (Lawal 17:22: 'You need to snap every tab when you touch it'; the CONTROLLER 22:16 (2)).
 * Measured on the round 3 preview, a chip's look changed only when the whole guide re-rendered. This chip keeps its own
 * touch: on pointerdown it paints the state the tap will give (or a gold ring where the tap changes no state) in its own
 * tiny render, before the page's work starts; the page's state then takes over. A swipe across the chip row cancels the
 * pointer and the chip goes back.
 */
function SnapChip({
  on,
  next,
  onSelect,
  children,
  ...rest
}: { on: boolean; next?: boolean; onSelect: () => void; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'className' | 'type'>) {
  const [heldFrom, setHeldFrom] = useState<boolean | null>(null)
  const held = heldFrom !== null && heldFrom === on
  const shown = held ? (next ?? !on) : on
  return (
    <button
      type="button"
      {...rest}
      data-snap={held ? 'touched' : undefined}
      onPointerDown={() => setHeldFrom(on)}
      onPointerCancel={() => setHeldFrom(null)}
      onClick={() => {
        onSelect()
        window.setTimeout(() => setHeldFrom(null), 400)
      }}
      className={`${chip(shown)} ${held ? 'ring-2 ring-[var(--color-gold-400)]' : ''}`}
    >
      {children}
    </button>
  )
}

/** A link chip that turns selected and busy on pointerdown, before the navigation starts (then useLinkStatus holds it). */
function SnapLink({
  href,
  className,
  label,
  plain = false,
  ...rest
}: { href: string; className: string; label: string; plain?: boolean; 'aria-label'?: string }) {
  const [going, setGoing] = useState(false)
  return (
    <Link
      href={href}
      className={className}
      {...rest}
      data-snap={going ? 'touched' : undefined}
      onPointerDown={() => setGoing(true)}
      onPointerCancel={() => setGoing(false)}
      onClick={() => setGoing(true)}
    >
      <TapAnswer label={label} plain={plain} going={going} />
    </Link>
  )
}

function RailHead({ title, onAll }: { title: string; onAll?: () => void }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="type-rail-heading font-headline font-extrabold text-[var(--text-primary)]">{title}</h2>
      {onAll ? (
        <button
          type="button"
          onClick={onAll}
          className="inline-flex min-h-11 items-center font-display text-sm font-bold text-[var(--brand-accent-strong)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
        >
          See all
        </button>
      ) : null}
    </div>
  )
}

/** A photograph WHOLE at its own shape inside its box, over its own blurred copy (law 15), only where one is permitted. */
function WholePhoto({ src, className }: { src: string; className: string }) {
  return (
    <span data-row-thumb className={`relative block overflow-hidden bg-[var(--surface-1)] ${className}`}>
      <span className="ledger-blur" aria-hidden="true">
        <EventCardMedia src={src} alt="" variant="row-thumb" />
      </span>
      <EventCardMedia src={src} alt="" variant="row-thumb" objectFit="contain" />
    </span>
  )
}

function BigCard({ e }: { e: Entry }) {
  const r = e.row
  const b = bookingLine(r)
  return (
    <Link
      href={r.href}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white shadow-[var(--shadow-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
    >
      {r.thumb ? <WholePhoto src={r.thumb} className="aspect-[3/2] w-full" /> : null}
      <span className="flex flex-1 flex-col gap-2 p-4">
        <span className="font-display text-xs font-extrabold uppercase tracking-wider text-[var(--brand-accent-strong)] [overflow-wrap:anywhere]">
          {[r.category, r.venue].filter(Boolean).join(' · ')}
        </span>
        <span className="font-headline text-xl font-extrabold leading-snug text-[var(--text-primary)] [overflow-wrap:anywhere] group-hover:underline">{r.title}</span>
        {r.teaser ? <span className="line-clamp-3 font-body text-sm text-[var(--text-secondary)]">{r.teaser}</span> : null}
        <span className="flex flex-wrap gap-2">
          <span className="rounded-full border border-[var(--color-ink-200)] px-3 py-1 font-display text-xs font-semibold text-[var(--text-primary)]">{whenLine(e)}</span>
          {/^From /.test(r.price) ? (
            <span className="rounded-full border border-[var(--color-ink-200)] px-3 py-1 font-display text-xs font-semibold text-[var(--text-primary)]">{r.price}</span>
          ) : null}
        </span>
        <span className="mt-auto flex items-center justify-between gap-3 pt-2">
          <span className="font-display text-sm text-[var(--text-secondary)] [overflow-wrap:anywhere]">{b.book ?? b.said ?? ''}{b.outbound ? <span className="sr-only"> (another site)</span> : null}</span>
          <span className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-gold-500 px-4 font-display text-sm font-bold text-ink-900">
            {r.free ? 'See details' : GET_TICKETS}
          </span>
        </span>
      </span>
    </Link>
  )
}

function CardRail({ entries }: { entries: readonly Entry[] }) {
  return (
    <ul className="relative -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] sm:mx-0 sm:px-0">
      {entries.map((e) => (
        <li key={e.row.id} className="w-[78%] shrink-0 sm:w-64">
          <Link
            href={e.row.href}
            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
          >
            {e.row.thumb ? <WholePhoto src={e.row.thumb} className="aspect-[4/3] w-full" /> : null}
            <span className="flex flex-1 flex-col gap-1 p-3">
              <span className="font-display text-xs font-extrabold uppercase tracking-wider text-[var(--brand-accent-strong)]">{whenLine(e)}</span>
              <span className="font-headline text-base font-bold leading-snug text-[var(--text-primary)] [overflow-wrap:anywhere] group-hover:underline">{e.row.title}</span>
              {e.row.teaser ? <span className="line-clamp-2 font-body text-sm text-[var(--text-secondary)]">{e.row.teaser}</span> : null}
              <span className="mt-auto pt-1 font-display text-xs font-semibold text-[var(--text-muted)] [overflow-wrap:anywhere]">
                {bookingLine(e.row).book ?? bookingLine(e.row).said ?? e.row.venue ?? ''}
                {bookingLine(e.row).outbound ? <span className="sr-only"> (another site)</span> : null}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function MonthList({ entries, cityName }: { entries: readonly Entry[]; cityName: string }) {
  return (
    <div className="mt-4 space-y-6">
      {byMonth(entries).map((m) => (
        <section key={m.key} aria-label={m.label} className="[content-visibility:auto] [contain-intrinsic-size:auto_480px]">
          <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-[var(--text-muted)]">{m.label}</h3>
          <ul className="relative mt-2 overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white">
            {m.entries.map((e) => (
              <li key={e.row.id} className="border-b border-[var(--surface-2)] last:border-b-0">
                <Row e={e} cityName={cityName} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * THE BOOKING LINE, ONE RULE (the directive, section D): 'Book on EventLinqs' only where our own checkout sells the
 * night; 'Tickets on <site>' with the outbound mark where another site sells it; 'Free entry' where it is free and walk
 * in. Read from the row's own source words (src/lib/events/whats-on-directory.ts sourceLabel); payment code untouched.
 */
/**
 * THE COUNT, TOLD HONESTLY (Lawal, 2 November 2026, 09:00, refinement 6; the CONTROLLER's 09:13 (3); WINDOW 6's table,
 * C:\dev\EVIDENCE\GEELONG-REFERENCE-2NOV\counts\README.md: 410 dates of 196 events). An EVENT is a title at a venue, the
 * key that table used; a DATE is one listed night. Both come from the same rows, so the two numbers always agree.
 */
export function eventKey(r: Pick<DirectoryRow, 'title' | 'venue'>): string {
  return listingKey(r)
}
const listingCount = (rows: readonly Pick<DirectoryRow, 'title' | 'venue'>[]) => new Set(rows.map(listingKey)).size

export function eventCount(rows: readonly Pick<DirectoryRow, 'title' | 'venue'>[]): number {
  return new Set(rows.map(eventKey)).size
}

/** 'N events, M dates', and with a filter on, 'N events, M dates of T events'. */
export function countLine(rows: readonly Pick<DirectoryRow, 'title' | 'venue'>[], of: readonly Pick<DirectoryRow, 'title' | 'venue'>[] | null): string {
  const e = eventCount(rows)
  const words = `${e} ${e === 1 ? 'event' : 'events'}, ${rows.length} ${rows.length === 1 ? 'date' : 'dates'}`
  return of ? `${words} of ${eventCount(of)} events` : words
}

/** Each category's EVENT count, [slug, label, n], from the rows given. */
export function eventsByCategory(rows: readonly DirectoryRow[]): [string, string, number][] {
  const seen = new Map<string, { label: string; keys: Set<string> }>()
  for (const r of rows) {
    if (!r.categorySlug || !r.category) continue
    const c = seen.get(r.categorySlug) ?? { label: r.category, keys: new Set<string>() }
    c.keys.add(eventKey(r))
    seen.set(r.categorySlug, c)
  }
  return [...seen.entries()].map(([slug, c]) => [slug, c.label, c.keys.size])
}

/**
 * ONE ROW, EACH FACT ONCE (Lawal, 2 November 2026, 09:00, refinements 1 and 4). `said` is the row's one meta word for
 * price: 'Free · Walk in' for a free walk-in night, 'Free' for a free night with a booking, else the price; `book` is
 * where it is booked ('Book on EventLinqs', 'Tickets at <seller>', 'Register at <seller>', 'Get tickets'), alone on its
 * line, with the outbound mark when it leaves EventLinqs. Nothing is said twice and no row names a domain.
 */
export function bookingLine(r: Pick<DirectoryRow, 'price' | 'source' | 'free'>): { said: string | null; book: string | null; outbound: boolean } {
  if (r.source === WALK_IN_LABEL) return { said: WALK_IN_LABEL, book: null, outbound: false }
  const said = r.free ? ROW_FREE_WITH_BOOKING : r.price || null
  if (r.source === OUR_CHECKOUT_LABEL || r.source === OUR_REGISTRATION_LABEL) return { said, book: r.source, outbound: false }
  if (OUTBOUND_LABEL.test(r.source)) return { said, book: r.source, outbound: true }
  return { said, book: null, outbound: false }
}

function Row({ e, cityName }: { e: Entry; cityName: string }) {
  const r = e.row
  const more = e.more
  // The city is the page's own, so a row names a place only when it is a nearby one the visitor widened to.
  const elsewhere = r.city && !r.cityKey.includes(cityName) ? r.city : null
  const b = bookingLine(r)
  const booking = b.book ? (
    <span className="guide-row-book">
      {b.book}
      {b.outbound ? (
        <>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="sr-only"> (another site)</span>
        </>
      ) : null}
    </span>
  ) : null
  // EVERY ROW SELLS (round 3, item 6): when in gold caps, the title, our one line, the venue, Free or the seller, the fold
  // line; the photograph on the right, whole, only where one is permitted (a row without one keeps its width for text).
  return (
    <Link
      href={r.href}
      className="group guide-row"
    >
      <span className="min-w-0 flex-1">
        {/* A time is one line, '10:30 am' and '12:30 pm' alike (round 2, item 3): the when line never breaks. */}
        <span className="guide-row-when">{whenLine(e)}</span>
        <span className="guide-row-title">
          {r.title}
        </span>
        {/* Round 3 (4): the event's own one line, where it says more than the row does (rowTeaser), two lines at most. */}
        {r.teaser ? (
          <span className="mt-1 line-clamp-2 block font-body text-sm text-[var(--text-secondary)] [overflow-wrap:anywhere]">{r.teaser}</span>
        ) : null}
        <span className="guide-row-line">
          {[r.venue, r.suburb && r.suburb !== r.venue && r.suburb.toLowerCase() !== cityName ? r.suburb : null, elsewhere].filter(Boolean).join(', ')}
        </span>
        <span className="mt-1 block font-display text-xs font-semibold text-[var(--text-muted)] [overflow-wrap:anywhere]">
          {[r.category, b.said, more > 0 ? `+${more} more ${more === 1 ? 'date' : 'dates'}` : null].filter(Boolean).join(' · ')}
        </span>
        {booking ? <span className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">{booking}</span> : null}
      </span>
      {r.thumb ? <WholePhoto src={r.thumb} className="aspect-[4/3] w-28 shrink-0 self-start rounded-lg md:w-40" /> : null}
    </Link>
  )
}

function CitySheet({
  cities,
  current,
  onClose,
}: {
  cities: readonly { slug: string; name: string; state: string }[]
  current: string
  onClose: () => void
}) {
  const byState = new Map<string, { slug: string; name: string }[]>()
  for (const c of cities) byState.set(c.state, [...(byState.get(c.state) ?? []), c])
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--color-ink-900)]/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change city"
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 md:max-w-2xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-headline text-xl font-extrabold text-[var(--text-primary)]">Change city</h2>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-[var(--color-ink-100)]" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {[...byState.entries()].map(([state, list]) => (
          <Group key={state} label={state}>
            {list.map((c) => (
              <Link key={c.slug} href={`/city/${c.slug}`} aria-current={c.slug === current ? 'page' : undefined} className={chip(c.slug === current)}>
                {c.name}
              </Link>
            ))}
          </Group>
        ))}
      </div>
    </div>,
    document.body,
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 font-display text-xs font-extrabold uppercase tracking-widest text-[var(--text-muted)]">{label}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

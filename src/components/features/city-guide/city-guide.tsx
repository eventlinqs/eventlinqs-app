'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpRight, Briefcase, CalendarDays, ChevronDown, Drama, GraduationCap, Hammer, HeartHandshake, HeartPulse, Laugh, MapPin, Moon, Music,
  Palette, PartyPopper, Search, Sparkles, Store, Trophy, Users, UtensilsCrossed, X,
} from 'lucide-react'
import { OUR_CHECKOUT_LABEL, OUR_REGISTRATION_LABEL, OUTBOUND_LABEL, WALK_IN_LABEL, type DirectoryRow } from '@/lib/events/whats-on-directory'
import { ROW_FREE_WITH_BOOKING } from '@/lib/events/cta'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { collapseListings } from '@/lib/events/one-card-per-event'

/**
 * THE CITY GUIDE (the city-first directive of 1 November 2026, C:\dev\DESIGN\CITY-FIRST-1NOV, sections 1 and 6). One
 * component for every city, nothing written for one city alone. It answers, in this order: WHERE (the city, chosen
 * first, never mixed; nearby places only when the visitor widens on purpose), WHAT (search in the city, the categories
 * the city actually holds, with their counts) and WHEN (Today, Tomorrow, This weekend, Next 7 days, Choose dates).
 * Then Featured (Ledger cards, authorised photographs only), Happening this week, and the complete calendar after it.
 * Every row: the time where one is held, the title, the venue, the price and where it is booked.
 */

export type GuideCity = { slug: string; name: string; state: string; lat: number; lng: number }
type When = 'all' | 'today' | 'tomorrow' | 'weekend' | 'week' | 'date'
type Days = { todayKey: string; tomorrowKey: string; weekendKeys: string[]; weekKeys: string[] }
type Price = 'all' | 'free' | 'paid'

const WHEN: { key: When; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week', label: 'Next 7 days' },
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
  worth = [],
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
  const [when, setWhen] = useState<When>('all')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('all')
  const [suburb, setSuburb] = useState('all')
  const [price, setPrice] = useState<Price>('all')
  const [weekendPrice, setWeekendPrice] = useState<Price>('all')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(0)
  const [cities, setCities] = useState(false)
  const [wholeState, setWholeState] = useState(false)

  // One card per event: a listing's later nights are named on its first card, never a second card (one-card-per-event.ts).
  const worthCards = collapseListings(worth, 6)
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
  const matchesWhen = (r: DirectoryRow) =>
    when === 'all' ||
    (when === 'today' && r.dayKey === days.todayKey) ||
    (when === 'tomorrow' && r.dayKey === days.tomorrowKey) ||
    (when === 'weekend' && weekendDays.includes(r.dayKey)) ||
    (when === 'week' && days.weekKeys.includes(r.dayKey)) ||
    (when === 'date' && r.dayKey === date)
  const matchesPrice = (r: DirectoryRow, p: Price) => p === 'all' || (p === 'free' ? r.free : !r.free)
  const shown = here.filter(
    (r) =>
      matchesQ(r) &&
      matchesWhen(r) &&
      (category === 'all' || r.categorySlug === category) &&
      (suburb === 'all' || (r.suburb ?? '') === suburb) &&
      matchesPrice(r, price),
  )

  // '+N more dates' (C:\dev\EVIDENCE\CITY-FIRST-1NOV\design\leaders-city-guide.md): a night whose title and venue come
  // again later says how many more dates it has, so a weekly night reads as one thing, not a wall of repeats. It keys on
  // eventKey, the one definition of an event the tiles and the count line use (round 2, item 2).
  const repeats = new Map<string, number>()
  for (const r of here) {
    const k = eventKey(r)
    repeats.set(k, (repeats.get(k) ?? 0) + 1)
  }
  const seenOnce = new Map<string, number>()
  const moreDates = new Map<string, number>()
  for (const r of [...here].sort((a, b) => a.ts - b.ts)) {
    const k = eventKey(r)
    const i = (seenOnce.get(k) ?? 0) + 1
    seenOnce.set(k, i)
    moreDates.set(r.id, (repeats.get(k) ?? 1) - i)
  }

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

  const weekendAll = here.filter((r) => weekendDays.includes(r.dayKey))
  const weekend = weekendAll.filter((r) => matchesPrice(r, weekendPrice))

  // Section 5's suburb choice: the suburbs this city's own rows name.
  const suburbs = [...new Set(here.map((r) => r.suburb).filter((s): s is string => Boolean(s)))].sort((a, b) => a.localeCompare(b))
  const filtered = when !== 'all' || category !== 'all' || suburb !== 'all' || price !== 'all' || words.length > 0
  const toList = () => document.getElementById('city-calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const clear = () => {
    setWhen('all')
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
          <button type="button" aria-pressed={wholeState} onClick={() => setWholeState(!wholeState)} className={chip(wholeState)}>
            {stateName}
          </button>
          {quickCities.map((c) =>
            c.slug === city.slug ? (
              <button key={c.slug} type="button" aria-pressed={!wholeState} onClick={() => setWholeState(false)} className={chip(!wholeState)}>
                {c.name}
              </button>
            ) : (
              <Link key={c.slug} href={`/city/${c.slug}`} className={chip(false)}>
                {c.name}
              </Link>
            ),
          )}
          <button type="button" onClick={() => setCities(true)} className={chip(false)} aria-haspopup="dialog">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Change city
          </button>
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
          <Link
            href={`/events${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`}
            aria-label="Search all of Australia"
            className="inline-flex min-h-11 shrink-0 items-center font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-4"
          >
            All of Australia
          </Link>
        </div>

        <div className={`mt-3 ${SCROLL_ROW}`}>
        <div className="flex shrink-0 gap-2" role="group" aria-label="When">
          {WHEN.map((w) => (
            <button key={w.key} type="button" aria-pressed={when === w.key} onClick={() => setWhen(when === w.key ? 'all' : w.key)} className={chip(when === w.key)}>
              {w.label}
            </button>
          ))}
          {/* 'Choose dates' reads as a chip; the date field covers it and opens the browser's own calendar on a tap. */}
          <label className={`relative ${chip(when === 'date')}`}>
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span>{when === 'date' && date ? dateWords(date) : 'Choose dates'}</span>
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
                setWhen(e.target.value ? 'date' : 'all')
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

        {/* 2 EXPLORE BY INTEREST. */}
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
                      className={`flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-center shadow-[var(--shadow-card)] transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
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

        {/* 3 WORTH GOING OUT FOR: organiser artwork with its rights on record, whole; not drawn under three. */}
        {worthCards.length >= WORTH_MINIMUM ? (
          <section aria-label="Worth going out for" className="mt-12">
            <SectionHead eyebrow="Featured" title="Worth going out for" />
            <ul className="relative -mx-4 mt-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible">
              {worthCards.map((e) => (
                <li key={e.id} className="w-[82%] shrink-0 snap-start sm:w-[46%] lg:w-auto">
                  <EventCard event={e} variant="grid-one-two-four" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 4 THIS WEEKEND: Friday to Sunday, with Free and Paid. */}
        {weekendAll.length > 0 ? (
          <section aria-label={`This weekend in ${placeName}`} className="mt-12">
            <SectionHead eyebrow="This weekend" title="Plan your weekend" />
            <div className={`mt-3 ${SCROLL_ROW}`} role="group" aria-label="This weekend, by price">
              {PRICES.map((p) => (
                <button key={p.key} type="button" aria-pressed={weekendPrice === p.key} onClick={() => setWeekendPrice(p.key)} className={chip(weekendPrice === p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            {weekend.length > 0 ? (
              <DayList rows={weekend} cityName={name} more={moreDates} />
            ) : (
              <p className="mt-4 rounded-2xl border border-[var(--surface-2)] bg-white px-5 py-6 font-display text-base text-[var(--text-secondary)]">
                Nothing {weekendPrice === 'free' ? 'free' : 'paid'} this weekend yet. Every night this weekend is under All.
              </p>
            )}
          </section>
        ) : null}

        {/* 5 THE COMPLETE DIRECTORY: every listed night of this city, by day; never hidden by 3 or 4. */}
        <section id="city-calendar" aria-label={`All events in ${placeName}`} className="mt-12 scroll-mt-24">
          <SectionHead eyebrow="Every event, by day" title={`All events in ${placeName}`} />
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
              {countLine(filtered ? shown : here, filtered ? here : null)} coming up in{' '}
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
          {shown.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-[var(--surface-2)] bg-white px-5 py-8 font-display text-base text-[var(--text-secondary)]">
              Nothing in {placeName} matches these choices yet. Try another date or suburb, or clear the filters.
            </p>
          ) : (
            <DayList rows={shown} cityName={name} more={moreDates} />
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

function DayList({ rows, cityName, more }: { rows: readonly DirectoryRow[]; cityName: string; more: ReadonlyMap<string, number> }) {
  const groups: { key: string; label: string; rows: DirectoryRow[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.key === r.dayKey) last.rows.push(r)
    else groups.push({ key: r.dayKey, label: r.dayLabel, rows: [r] })
  }
  return (
    <div className="mt-4 space-y-6">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label} className="[content-visibility:auto] [contain-intrinsic-size:auto_480px]">
          <h3 className="font-headline text-lg font-extrabold text-[var(--text-primary)]">{g.label}</h3>
          <ul className="relative mt-2 overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white">
            {g.rows.map((r) => (
              <li key={r.id} className="border-t border-[var(--color-ink-100)] first:border-t-0">
                <Row r={r} cityName={cityName} more={more.get(r.id) ?? 0} />
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
  return `${r.title.trim().toLowerCase()}|${(r.venue ?? '').trim().toLowerCase()}`
}

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

function Row({ r, cityName, more }: { r: DirectoryRow; cityName: string; more: number }) {
  // The city is the page's own, so a row names a place only when it is a nearby one the visitor widened to.
  const elsewhere = r.city && !r.cityKey.includes(cityName) ? r.city : null
  const b = bookingLine(r)
  const booking = b.book ? (
    <span className="inline-flex items-start gap-1 font-display text-sm font-bold text-[var(--text-primary)] [overflow-wrap:anywhere]">
      {b.book}
      {b.outbound ? (
        <>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="sr-only"> (another site)</span>
        </>
      ) : null}
    </span>
  ) : null
  return (
    <Link
      href={r.href}
      className="group grid min-h-11 grid-cols-[4.25rem_minmax(0,1fr)] items-start gap-3 px-4 py-4 transition-colors hover:bg-[var(--color-canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-gold-400)] md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,14rem)] md:px-5"
    >
      {/* A time is one line, '10:30 am' and '12:30 pm' alike (Lawal's round 2, item 3): never broken at its space. */}
      <span className="whitespace-nowrap pt-0.5 font-display text-sm font-extrabold text-[var(--text-primary)]">{r.time ?? ''}</span>
      <span className="min-w-0">
        <span className="block font-headline text-base font-bold leading-snug text-[var(--text-primary)] [overflow-wrap:anywhere] underline-offset-4 decoration-[var(--brand-accent)] decoration-2 group-hover:underline md:text-lg">
          {r.title}
        </span>
        <span className="mt-1 block font-display text-sm font-medium text-[var(--text-secondary)] [overflow-wrap:anywhere]">
          {[r.venue, r.suburb && r.suburb !== r.venue && r.suburb.toLowerCase() !== cityName ? r.suburb : null, elsewhere].filter(Boolean).join(', ')}
        </span>
        <span className="mt-1 block font-display text-xs font-semibold text-[var(--text-muted)] [overflow-wrap:anywhere]">
          {[r.category, b.said, more > 0 ? `+${more} more ${more === 1 ? 'date' : 'dates'}` : null].filter(Boolean).join(' \u00b7 ')}
        </span>
        {/* On a phone where it is booked sits on its own line under the venue (the directive, C). */}
        {booking ? <span className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 md:hidden">{booking}</span> : null}
      </span>
      <span className="hidden flex-col items-end gap-1 pt-0.5 text-right md:flex">{booking}</span>
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

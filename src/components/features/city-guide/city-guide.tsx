'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Briefcase, CalendarDays, ChevronRight, Drama, GraduationCap, Hammer, HeartHandshake, HeartPulse, Laugh, MapPin, Moon, Music,
  Palette, PartyPopper, Search, Sparkles, Store, Trophy, Users, UtensilsCrossed, X,
} from 'lucide-react'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'

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

const WHEN: { key: When; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week', label: 'Next 7 days' },
]
const RADII = [0, 25, 50] as const
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
  featured = [],
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
   * Featured, when the city holds exactly two nights with a rights recorded photograph (three or more are the slider
   * above the page): the approved Featured + Directory direction (C:\dev\DESIGN\CITY-FIRST-1NOV\CITY-FIRST-DIRECTIVE-1NOV.md
   * s6; Lawal's 11:01 rule, never under two).
   */
  featured?: readonly EventCardData[]
}) {
  const [q, setQ] = useState('')
  const [when, setWhen] = useState<When>('all')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('all')
  const [radius, setRadius] = useState<(typeof RADII)[number]>(0)
  const [cities, setCities] = useState(false)
  const [wholeState, setWholeState] = useState(false)
  const [freeOnly, setFreeOnly] = useState(false)

  const name = city.name.toLowerCase()
  const inCity = (r: DirectoryRow) => r.cityKey.includes(name)
  const near = (r: DirectoryRow) =>
    radius > 0 && r.lat !== null && r.lng !== null && km(city.lat, city.lng, r.lat, r.lng) <= radius
  const inState = (r: DirectoryRow) => stateCityNames.some((n) => r.cityKey.includes(n))
  const here = rows.filter((r) => (wholeState ? inState(r) : inCity(r) || near(r)))
  const placeName = wholeState ? stateName : city.name

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matchesQ = (r: DirectoryRow) =>
    words.every((w) => `${r.title} ${r.venue ?? ''} ${r.category ?? ''}`.toLowerCase().includes(w))
  const matchesWhen = (r: DirectoryRow) =>
    when === 'all' ||
    (when === 'today' && r.dayKey === days.todayKey) ||
    (when === 'tomorrow' && r.dayKey === days.tomorrowKey) ||
    (when === 'weekend' && days.weekendKeys.includes(r.dayKey)) ||
    (when === 'week' && days.weekKeys.includes(r.dayKey)) ||
    (when === 'date' && r.dayKey === date)
  const shown = here.filter((r) => matchesQ(r) && matchesWhen(r) && (category === 'all' || r.categorySlug === category) && (!freeOnly || r.free))
  // '+N more dates' (Eventbrite's '+N more', the CONTROLLER's walk of 17:38): a night whose title and venue come again
  // later in this city says how many more dates it has, so a weekly night reads as one thing, not a wall of repeats.
  const repeats = new Map<string, number>()
  for (const r of here) {
    const k = `${r.title.toLowerCase()}|${(r.venue ?? '').toLowerCase()}`
    repeats.set(k, (repeats.get(k) ?? 0) + 1)
  }
  const seenOnce = new Map<string, number>()
  const moreDates = new Map<string, number>()
  for (const r of [...here].sort((a, b) => a.ts - b.ts)) {
    const k = `${r.title.toLowerCase()}|${(r.venue ?? '').toLowerCase()}`
    const i = (seenOnce.get(k) ?? 0) + 1
    seenOnce.set(k, i)
    moreDates.set(r.id, (repeats.get(k) ?? 1) - i)
  }

  // Explore: the categories this city actually holds, with their counts; a category with nothing is not drawn.
  const counts = new Map<string, { label: string; n: number }>()
  for (const r of here) {
    if (!r.categorySlug || !r.category) continue
    const c = counts.get(r.categorySlug) ?? { label: r.category, n: 0 }
    c.n += 1
    counts.set(r.categorySlug, c)
  }
  // In the order a visitor looks (Lawal's design notes of 1 November 2026, 19:17, (3)): music, sport, comedy, nightlife,
  // markets, food and drink, family, arts; then the rest by how many nights each holds.
  const rank = (slug: string) => {
    const i = EXPLORE_ORDER.indexOf(slug)
    return i < 0 ? EXPLORE_ORDER.length : i
  }
  const tiles = [...counts.entries()].sort(
    (a, b) => rank(a[0]) - rank(b[0]) || b[1].n - a[1].n || a[1].label.localeCompare(b[1].label),
  )

  const week = shown.filter((r) => days.weekKeys.includes(r.dayKey))
  const later = shown.filter((r) => !days.weekKeys.includes(r.dayKey))
  const filtered = when !== 'all' || category !== 'all' || words.length > 0 || freeOnly
  const toList = () => document.getElementById('city-calendar')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="bg-canvas pb-28 md:pb-12">
      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8 md:pt-6">
        {/* WHERE: the city first (its name and photograph head the page), switched in one tap; every other city one more. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Choose a city">
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

        {/* WHAT: search inside the city; all of Australia one tap away. */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex min-h-12 flex-1 items-center gap-3 rounded-full border border-[var(--color-ink-200)] bg-white px-4 focus-within:ring-2 focus-within:ring-[var(--color-gold-400)]">
            <Search className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search events, artists, venues in ${placeName}`}
              aria-label={`Search events in ${placeName}`}
              className="min-w-0 flex-1 bg-transparent font-display text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
          </label>
          <Link
            href={`/events${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`}
            className="inline-flex min-h-11 items-center font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-4"
          >
            Search all of Australia
          </Link>
        </div>

        {/* WHEN: the dates people plan in; the area widens only on purpose. */}
        <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="When">
          {WHEN.map((w) => (
            <button key={w.key} type="button" aria-pressed={when === w.key} onClick={() => setWhen(when === w.key ? 'all' : w.key)} className={chip(when === w.key)}>
              {w.label}
            </button>
          ))}
          {/* 'Choose dates' reads as a chip, as Lawal's structure draws it; the date field covers it and opens the
              browser's own calendar on a tap. */}
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
        <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Price and area">
          <button type="button" aria-pressed={freeOnly} onClick={() => setFreeOnly(!freeOnly)} className={chip(freeOnly)}>
            Free
          </button>
          {(wholeState ? [] : RADII).map((r) => (
            <button key={r} type="button" aria-pressed={radius === r} onClick={() => setRadius(r)} className={chip(radius === r)}>
              {r === 0 ? `In ${city.name}` : `Within ${r} km`}
            </button>
          ))}
        </div>

        {/* Explore: the city's own categories as Lawal's structure draws them (the icon over the name, three across from
            a small tablet up), each with the number it holds; a category with nothing is not drawn; 'All events' last. */}
        {tiles.length > 0 ? (
          <section aria-label={`Explore ${placeName}`} className="mt-8">
            <h2 className="type-rail-heading font-headline font-extrabold text-[var(--text-primary)]">Explore {placeName}</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[...tiles, ['all', { label: 'All events', n: here.length }] as const].map(([slug, c]) => {
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
                      className={`flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] ${
                        on ? 'border-[var(--color-ink-900)] bg-[var(--color-ink-900)] text-white' : 'border-[var(--surface-2)] bg-white text-[var(--text-primary)] hover:border-[var(--color-ink-400)]'
                      }`}
                    >
                      <Icon className={`h-6 w-6 ${on ? 'text-[var(--brand-accent)]' : 'text-[var(--text-primary)]'}`} aria-hidden="true" />
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

        {featured.length === 2 ? (
          <section aria-label={`Featured in ${placeName}`} className="mt-10">
            <h2 className="type-rail-heading font-headline font-extrabold text-[var(--text-primary)]">Featured in {placeName}</h2>
            <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {featured.map((e) => (
                <li key={e.id}>
                  <EventCard event={e} variant="grid-one-two-four" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="city-calendar" aria-label={`Every event in ${placeName}`} className="mt-10 scroll-mt-24">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="type-rail-heading font-headline font-extrabold text-[var(--text-primary)]">
              {filtered ? `${shown.length} ${shown.length === 1 ? 'event' : 'events'} found` : 'Happening this week'}
            </h2>
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setWhen('all')
                  setCategory('all')
                  setQ('')
                  setDate('')
                  setFreeOnly(false)
                }}
                className="inline-flex min-h-11 items-center gap-1 font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-4"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            ) : (
              <p className="font-display text-sm font-semibold text-[var(--text-muted)]">
                {here.length} {here.length === 1 ? 'event' : 'events'} coming up in {radius && !wholeState ? `${city.name} and within ${radius} km` : placeName}
                {later.length > 0 ? (
                  <>
                    {' \u00b7 '}
                    <a href="#city-calendar-full" className="font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-4">
                      View calendar
                    </a>
                  </>
                ) : null}
              </p>
            )}
          </div>
          {shown.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-[var(--surface-2)] bg-white px-5 py-8 font-display text-base text-[var(--text-secondary)]">
              Nothing in {placeName} matches these choices yet. Try another date, widen the area, or clear the filters.
            </p>
          ) : filtered ? (
            <DayList rows={shown} cityName={name} more={moreDates} />
          ) : (
            <>
              {week.length > 0 ? <DayList rows={week} cityName={name} more={moreDates} /> : null}
              {later.length > 0 ? (
                <>
                  <h2 id="city-calendar-full" className="type-rail-heading mt-10 scroll-mt-24 font-headline font-extrabold text-[var(--text-primary)]">
                    The full calendar
                  </h2>
                  <DayList rows={later} cityName={name} more={moreDates} />
                </>
              ) : null}
            </>
          )}
        </section>
      </div>

      {cities ? (
        <CitySheet cities={allCities} current={city.slug} onClose={() => setCities(false)} />
      ) : null}
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
        <section key={g.key} aria-label={g.label}>
          <h3 className="font-headline text-lg font-extrabold text-[var(--text-primary)]">{g.label}</h3>
          <ul className="mt-2 overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white">
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

function Row({ r, cityName, more }: { r: DirectoryRow; cityName: string; more: number }) {
  // The city is the page's own, so a row names a place only when it is a nearby one the visitor widened to.
  const elsewhere = r.city && !r.cityKey.includes(cityName) ? r.city : null
  return (
    <Link
      href={r.href}
      className="group grid min-h-11 grid-cols-[4rem_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 transition-colors hover:bg-[var(--color-canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-gold-400)] md:px-5"
    >
      <span className="pt-0.5 font-display text-sm font-extrabold text-[var(--text-primary)]">{r.time ?? ''}</span>
      <span className="min-w-0">
        <span className="block font-headline text-base font-bold leading-snug text-[var(--text-primary)] line-clamp-2 underline-offset-4 decoration-[var(--brand-accent)] decoration-2 group-hover:underline md:text-lg">
          {r.title}
        </span>
        <span className="mt-1 block truncate font-display text-sm font-medium text-[var(--text-secondary)]">
          {[r.venue, elsewhere].filter(Boolean).join(', ')}
        </span>
        <span className="mt-1 block font-display text-xs font-semibold text-[var(--text-muted)]">
          {[r.category, r.source, more > 0 ? `+${more} more ${more === 1 ? 'date' : 'dates'}` : null].filter(Boolean).join(' \u00b7 ')}
        </span>
      </span>
      <span className="flex items-center gap-1 pt-0.5">
        <span className="max-w-28 text-right font-display text-sm font-extrabold text-[var(--text-primary)] md:max-w-none md:whitespace-nowrap">{r.price}</span>
        <ChevronRight className="hidden h-4 w-4 text-[var(--color-ink-400)] md:block" aria-hidden="true" />
      </span>
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

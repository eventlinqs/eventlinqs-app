'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'
import { DISCOVERY_CITIES, type DiscoveryVariant } from '@/lib/events/discovery-cities'

/**
 * THE DISCOVERY DESIGN, THREE VARIANTS ON ONE FOUNDATION (Lawal's order of 1 November 2026, 11:14; the brief is
 * C:\dev\DESIGN\DISCOVERY-DESIGN-BRIEF-1NOV.md). All three share the sticky city switcher and date chips, the filters
 * in a bottom sheet (category, price, format), a ticket source on every row, the real time where held and nothing
 * where not, Ledger cards for Featured, and no placeholder card anywhere. They differ in how Featured meets the list:
 *   A Guide: two Featured cards stacked on a phone (four across on a desktop), 'See all featured', then the days.
 *   B Swipe: one swipeable Featured rail, the next card peeking, so the list starts on the first phone screen; each
 *     row has a time column at the left and a small square image at the right only where an authorised one exists.
 *   C Intent: Today, This weekend and Free this weekend as short counted lists with See all, Featured woven in after
 *     every eight rows of the full list (a real image only); on a desktop the intent lists left, Featured right.
 */


const WHEN: { key: When; label: string }[] = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week', label: 'Next 7 days' },
]

type Days = { todayKey: string; tomorrowKey: string; weekendKeys: string[]; weekKeys: string[] }

const inCity = (cityKey: string, city: string) => city === 'victoria' || cityKey.includes(city)

function chipClass(on: boolean): string {
  return `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 font-display text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 ${
    on
      ? 'border-[var(--color-ink-900)] bg-[var(--color-ink-900)] text-white'
      : 'border-[var(--color-ink-200)] bg-white text-[var(--text-primary)] hover:border-[var(--color-ink-400)]'
  }`
}

export function Discovery({
  variant,
  initialCity,
  rows,
  featured,
  days,
  categories,
}: {
  variant: DiscoveryVariant
  initialCity: string
  rows: readonly DirectoryRow[]
  featured: readonly EventCardData[]
  days: Days
  categories: readonly { key: string; label: string }[]
}) {
  const [city, setCity] = useState(initialCity)
  const [when, setWhen] = useState<When>('all')
  const [date, setDate] = useState('')
  const [category, setCategory] = useState('all')
  const [price, setPrice] = useState<'any' | 'free' | 'paid'>('any')
  const [format, setFormat] = useState<'any' | 'walk_in' | 'ticketed'>('any')
  const [sheet, setSheet] = useState(false)
  const [allFeatured, setAllFeatured] = useState(false)

  const cityLabel = DISCOVERY_CITIES.find((c) => c.key === city)?.label ?? 'Victoria'
  const filtersOn = (category !== 'all' ? 1 : 0) + (price !== 'any' ? 1 : 0) + (format !== 'any' ? 1 : 0)

  const passesFilters = (r: DirectoryRow) =>
    inCity(r.cityKey, city) &&
    (category === 'all' || r.categorySlug === category) &&
    (price === 'any' || (price === 'free' ? r.free : !r.free && r.price !== '')) &&
    (format === 'any' || r.format === format)
  const passesWhen = (r: DirectoryRow, w: When = when) =>
    w === 'all' ||
    (w === 'today' && r.dayKey === days.todayKey) ||
    (w === 'tomorrow' && r.dayKey === days.tomorrowKey) ||
    (w === 'weekend' && days.weekendKeys.includes(r.dayKey)) ||
    (w === 'week' && days.weekKeys.includes(r.dayKey)) ||
    (w === 'date' && r.dayKey === date)

  const shown = rows.filter((r) => passesFilters(r) && passesWhen(r))
  const cityFeatured = featured.filter((e) => inCity((e.venue_city ?? '').trim().toLowerCase(), city))
  const featuredShown = cityFeatured.length >= 2 ? cityFeatured : []

  const pickWhen = (w: When) => {
    setWhen(w)
    document.getElementById('discovery-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="bg-canvas">
      {/* The city and the date choice sit at the top and stay reachable (every leader does this on a phone). */}
      <div className="sticky z-40 border-b border-[var(--surface-2)] bg-white/95" style={{ top: 'var(--header-height)' }}>
        <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6 lg:px-8">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" role="group" aria-label="City">
            {DISCOVERY_CITIES.map((c) => (
              <button key={c.key} type="button" aria-pressed={city === c.key} onClick={() => setCity(c.key)} className={chipClass(city === c.key)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Date">
            {WHEN.map((w) => (
              <button key={w.key} type="button" aria-pressed={when === w.key} onClick={() => setWhen(w.key)} className={chipClass(when === w.key)}>
                {w.label}
              </button>
            ))}
            <label className={`${chipClass(when === 'date')} gap-2`}>
              <span>Pick a date</span>
              <input
                type="date"
                value={date}
                min={days.todayKey}
                onChange={(e) => {
                  setDate(e.target.value)
                  setWhen(e.target.value ? 'date' : 'all')
                }}
                className="w-36 bg-transparent text-base"
                aria-label="Pick a date"
              />
            </label>
            <button type="button" onClick={() => setSheet(true)} className={chipClass(filtersOn > 0)} aria-haspopup="dialog">
              Filters{filtersOn > 0 ? ` (${filtersOn})` : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <p className="font-display text-xs font-extrabold uppercase tracking-widest text-[var(--brand-accent-strong)]">
          {shown.length} {shown.length === 1 ? 'event' : 'events'} {when === 'all' ? 'coming up' : WHEN.find((w) => w.key === when)?.label.toLowerCase() ?? 'on that day'}
        </p>
        <h1 className="mt-1.5 font-headline text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">
          What&rsquo;s on in {cityLabel}
        </h1>

        {variant === 'a' || variant === 'b' ? (
          <>
            {featuredShown.length > 0 ? (
              <section aria-label="Featured this week" className="mt-6">
                <FeaturedHeading />
                {/* A stacks two on a phone (four across from xl); B is one rail, the next card peeking (no static
                    scroll snap: the Hero and LCP law). The first card is the page's LCP candidate in both. */}
                <ul
                  className={
                    variant === 'a'
                      ? 'grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-4'
                      : '-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 xl:grid xl:grid-cols-4 xl:gap-5 xl:overflow-visible'
                  }
                >
                  {(variant === 'a' && !allFeatured ? featuredShown.slice(0, 4) : featuredShown).map((e, i) => (
                    <li
                      key={e.id}
                      className={
                        variant === 'b'
                          ? 'w-5/6 shrink-0 sm:w-5/12 xl:w-auto'
                          : !allFeatured && i >= 2
                            ? 'hidden md:block'
                            : undefined
                      }
                    >
                      <EventCard event={e} variant="grid-one-two-four" priority={i === 0} />
                    </li>
                  ))}
                </ul>
                {variant === 'a' && featuredShown.length > 2 && !allFeatured ? (
                  <button type="button" onClick={() => setAllFeatured(true)} className="mt-3 inline-flex min-h-11 items-center font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-4">
                    See all featured ({featuredShown.length})
                  </button>
                ) : null}
              </section>
            ) : null}
            <List id="discovery-list" rows={shown} style={variant === 'a' ? 'guide' : 'swipe'} />
          </>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-6">
                {(
                  [
                    ['Today', 'today', (r: DirectoryRow) => passesWhen(r, 'today')],
                    ['This weekend', 'weekend', (r: DirectoryRow) => passesWhen(r, 'weekend')],
                    ['Free this weekend', 'weekend', (r: DirectoryRow) => passesWhen(r, 'weekend') && r.free],
                  ] as const
                ).map(([title, w, test]) => {
                  const list = rows.filter((r) => passesFilters(r) && test(r))
                  if (list.length === 0) return null
                  return (
                    <section key={title} aria-label={title}>
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <h2 className="font-headline text-xl font-extrabold text-[var(--text-primary)]">
                          {title} <span className="font-display text-sm font-bold text-[var(--text-muted)]">{list.length}</span>
                        </h2>
                        <button type="button" onClick={() => pickWhen(w)} className="inline-flex min-h-11 items-center font-display text-sm font-bold text-[var(--text-primary)] underline decoration-[var(--color-ink-200)] underline-offset-4">
                          See all
                        </button>
                      </div>
                      <ul className="overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white">
                        {list.slice(0, 5).map((r) => (
                          <li key={r.id} className="border-t border-[var(--color-ink-100)] first:border-t-0">
                            <Row r={r} style="guide" withDay={title !== 'Today'} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
              {featuredShown.length > 0 ? (
                <aside aria-label="Featured this week" className="hidden lg:block">
                  <FeaturedHeading />
                  <ul className="space-y-4">
                    {featuredShown.slice(0, 3).map((e) => (
                      <li key={e.id}>
                        <EventCard event={e} variant="grid-one-two-four" />
                      </li>
                    ))}
                  </ul>
                </aside>
              ) : null}
            </div>
            <List id="discovery-list" rows={shown} style="guide" weave={featuredShown} />
          </>
        )}
      </div>

      {sheet ? (
        <FilterSheet
          categories={categories}
          category={category}
          price={price}
          format={format}
          onCategory={setCategory}
          onPrice={setPrice}
          onFormat={setFormat}
          onClear={() => {
            setCategory('all')
            setPrice('any')
            setFormat('any')
          }}
          onClose={() => setSheet(false)}
          count={shown.length}
        />
      ) : null}
    </div>
  )
}

function FeaturedHeading() {
  return (
    <h2 className="mb-3 font-display text-xs font-extrabold uppercase tracking-widest text-[var(--brand-accent-strong)]">
      Featured this week
    </h2>
  )
}

type RowStyle = 'guide' | 'swipe'

function List({ id, rows, style, weave = [] }: { id: string; rows: readonly DirectoryRow[]; style: RowStyle; weave?: readonly EventCardData[] }) {
  const groups: { key: string; label: string; rows: DirectoryRow[] }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.key === r.dayKey) last.rows.push(r)
    else groups.push({ key: r.dayKey, label: r.dayLabel, rows: [r] })
  }
  let count = 0
  let woven = 0
  return (
    <section id={id} aria-label="Every event" className="mt-8 scroll-mt-48">
      <h2 className="mb-3 font-display text-xs font-extrabold uppercase tracking-widest text-[var(--brand-accent-strong)]">Every event</h2>
      {groups.length === 0 ? (
        <p className="rounded-2xl border border-[var(--surface-2)] bg-white px-5 py-8 font-display text-base text-[var(--text-secondary)]">
          Nothing matches these choices. Try another date or clear the filters.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[var(--surface-2)] bg-white">
          {groups.map((g, i) => (
            <div key={g.key}>
              <h3 className={`bg-[var(--color-canvas)] px-4 pb-2 pt-3.5 font-headline text-base font-extrabold text-[var(--text-primary)] md:px-5 ${i > 0 ? 'border-t border-[var(--surface-2)]' : ''}`}>
                {g.label}
              </h3>
              <ul>
                {g.rows.map((r) => {
                  count += 1
                  const card = weave.length > 0 && count % 8 === 0 && woven < weave.length ? weave[woven++] : null
                  return (
                    <li key={r.id} className="border-t border-[var(--color-ink-100)] first:border-t-0">
                      <Row r={r} style={style} />
                      {card ? (
                        <div className="border-t border-[var(--color-ink-100)] bg-[var(--color-canvas)] p-4 md:p-5">
                          <p className="mb-2 font-display text-xs font-extrabold uppercase tracking-widest text-[var(--brand-accent-strong)]">Featured</p>
                          <div className="max-w-sm">
                            <EventCard event={card} variant="grid-one-two-four" />
                          </div>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Row({ r, style, withDay = false }: { r: DirectoryRow; style: RowStyle; withDay?: boolean }) {
  const place = [r.category, r.city].filter(Boolean).join(' \u00b7 ')
  return (
    <div>
      <Link
        href={r.href}
        className={`group grid min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-gold-400)] md:px-5 ${
          style === 'swipe' ? 'grid-cols-[3.75rem_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]'
        }`}
      >
        {style === 'swipe' ? (
          <span className="self-start pt-0.5 font-display text-sm font-extrabold text-[var(--text-primary)]">
            {r.time ?? ''}
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="mb-1 block truncate font-display text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {[withDay ? r.dayLabel : null, style === 'guide' ? r.time : null, place].filter(Boolean).join(' \u00b7 ')}
          </span>
          <span className="block font-headline text-base font-bold leading-snug text-[var(--text-primary)] line-clamp-2 underline-offset-4 decoration-[var(--brand-accent)] decoration-2 group-hover:underline">
            {r.title}
          </span>
          {r.venue ? <span className="mt-0.5 block truncate font-display text-sm font-medium text-[var(--text-secondary)]">{r.venue}</span> : null}
          <span className="mt-1 block truncate font-display text-xs font-semibold text-[var(--text-muted)]">{r.source}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="text-right">
            <span className="block whitespace-nowrap font-display text-sm font-extrabold text-[var(--text-primary)]">{r.price}</span>
          </span>
          {style === 'swipe' && r.thumb ? (
            // A small square only where an authorised image exists, through the shared media component's list-thumb.
            <span className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--color-ink-100)]">
              <EventCardMedia src={r.thumb} alt="" variant="list-thumb" />
            </span>
          ) : null}
        </span>
      </Link>
    </div>
  )
}

function FilterSheet({
  categories,
  category,
  price,
  format,
  onCategory,
  onPrice,
  onFormat,
  onClear,
  onClose,
  count,
}: {
  categories: readonly { key: string; label: string }[]
  category: string
  price: 'any' | 'free' | 'paid'
  format: 'any' | 'walk_in' | 'ticketed'
  onCategory: (k: string) => void
  onPrice: (k: 'any' | 'free' | 'paid') => void
  onFormat: (k: 'any' | 'walk_in' | 'ticketed') => void
  onClear: () => void
  onClose: () => void
  count: number
}) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--color-ink-900)]/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 md:max-w-lg md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-headline text-xl font-extrabold text-[var(--text-primary)]">Filters</h2>
          <button type="button" onClick={onClear} className="inline-flex min-h-11 items-center font-display text-sm font-bold text-[var(--text-primary)] underline underline-offset-4">
            Clear
          </button>
        </div>
        <FilterGroup label="Category">
          {[{ key: 'all', label: 'Every category' }, ...categories].map((c) => (
            <button key={c.key} type="button" aria-pressed={category === c.key} onClick={() => onCategory(c.key)} className={chipClass(category === c.key)}>
              {c.label}
            </button>
          ))}
        </FilterGroup>
        <FilterGroup label="Price">
          {(
            [
              ['any', 'Any price'],
              ['free', 'Free'],
              ['paid', 'Paid'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={price === k} onClick={() => onPrice(k)} className={chipClass(price === k)}>
              {l}
            </button>
          ))}
        </FilterGroup>
        <FilterGroup label="Format">
          {(
            [
              ['any', 'Any'],
              ['walk_in', 'Walk in'],
              ['ticketed', 'Ticketed'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={format === k} onClick={() => onFormat(k)} className={chipClass(format === k)}>
              {l}
            </button>
          ))}
        </FilterGroup>
        <button type="button" onClick={onClose} className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--color-ink-900)] font-display text-base font-bold text-white">
          Show {count} {count === 1 ? 'event' : 'events'}
        </button>
      </div>
    </div>,
    document.body,
  )
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2 font-display text-xs font-extrabold uppercase tracking-widest text-[var(--text-muted)]">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  )
}

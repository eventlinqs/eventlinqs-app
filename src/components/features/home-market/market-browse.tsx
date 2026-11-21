'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpDown, ChevronDown, Map as MapIcon } from 'lucide-react'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import { IllustrativeChip } from '@/components/media/illustrative-chip'
import { SaveEventButton } from '@/components/features/events/save-event-button'
import { rememberCity } from '@/lib/events/chosen-city'
import { MARKET_PAGE, MARKET_TABS, SWITCH_CITIES, type MarketTab } from '@/lib/home/marketplace-tabs'
import type { MarketCard, MarketGrid } from '@/lib/home/market-cards'
import { ShareEventButton } from './share-event-button'

/**
 * BROWSING EVENTS IN <CITY> (law 46; the design engine, section 2; site.html): the city switch, the date and category
 * tabs, Sort and Map, and the grid of cards, eight at a time, then See more. The cards and each tab's order come
 * shaped from the server (src/lib/home/market-cards.ts); this only chooses which to draw.
 *
 * A card: the photograph (the night's own, else its venue's with its credit, else the labelled illustrative photograph
 * of its kind, else the brand panel), Tonight where true, the title, the date in the gold text tier, the venue, the
 * price or where it is booked, the category; save (the account's saved events; signed out, the tap asks to sign in) and
 * share. The whole card is one link; save and share sit beside it, never inside it.
 */

const TAB =
  'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-[3px] px-3 font-display text-[15px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-inset'
const TOOL =
  'inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-ink-200 bg-white px-4 font-display text-sm font-bold text-ink-900 transition-colors hover:border-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2'
const MENU_ITEM =
  'flex min-h-11 items-center px-4 font-display text-sm font-semibold text-ink-900 hover:bg-ink-100 focus-visible:outline-none focus-visible:bg-ink-100'

export function MarketBrowse({ grid, city, guideHref }: { grid: MarketGrid; city: { slug: string; name: string }; guideHref: string }) {
  const [tab, setTab] = useState<MarketTab>(grid.initial)
  const [shown, setShown] = useState(MARKET_PAGE)
  const ids = grid.tabs[tab] ?? []
  const cards = ids.slice(0, shown).map((id) => grid.cards[id]).filter((c): c is MarketCard => Boolean(c))
  const choose = (t: MarketTab) => {
    setTab(t)
    setShown(MARKET_PAGE)
  }
  const searchCity = encodeURIComponent(city.name)

  return (
    <section aria-labelledby="browsing-heading" className="mt-12">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* The page's one h1: the banner's slides rotate, so the heading that names the page is this one. */}
        <h1 id="browsing-heading" className="font-headline text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl">
          Browsing events in<span className="sr-only"> {city.name}</span>
        </h1>
        <CitySwitch current={city} />
      </div>

      <div className="mt-4 flex items-end gap-3 border-b border-ink-200">
        <div role="group" aria-label="Choose when and what" className="relative flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {MARKET_TABS.map((t) =>
            t.key === 'for-you' ? (
              <Link key={t.key} href={t.href} prefetch={false} className={`${TAB} border-transparent text-ink-600 hover:text-ink-900`}>
                {t.label}
              </Link>
            ) : (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                onClick={() => choose(t.key)}
                className={`${TAB} ${tab === t.key ? 'border-[var(--brand-accent)] text-ink-900' : 'border-transparent text-ink-600 hover:text-ink-900'}`}
              >
                {t.label}
              </button>
            ),
          )}
        </div>
        <div className="hidden shrink-0 items-center gap-2 pb-2 lg:flex">
          <SortMenu searchCity={searchCity} />
          <Link href={`/events?city=${searchCity}&view=map`} prefetch={false} className={TOOL}>
            <MapIcon className="h-4 w-4" aria-hidden />
            Map
          </Link>
        </div>
      </div>

      {cards.length > 0 ? (
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-7 lg:grid-cols-4">
          {cards.map((c) => (
            <li key={c.id}>
              <Card card={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-8 font-display text-base text-ink-600">
          Nothing listed for this yet in {city.name}.{' '}
          <Link href={guideHref} className="font-bold text-[var(--brand-accent-strong)] underline underline-offset-2">
            See every night in {city.name}
          </Link>
        </p>
      )}

      {cards.length > 0 ? (
        <div className="mt-8 flex justify-center">
          {shown < ids.length ? (
            <button type="button" onClick={() => setShown((n) => n + MARKET_PAGE)} className={SEE_MORE}>
              See more events
            </button>
          ) : (
            <Link href={guideHref} prefetch={false} className={SEE_MORE}>
              See more events
            </Link>
          )}
        </div>
      ) : null}
    </section>
  )
}

const SEE_MORE =
  'inline-flex min-h-12 items-center rounded-full border-2 border-ink-900 px-8 font-display text-base font-extrabold text-ink-900 transition-colors hover:bg-ink-900 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2'

const PHOTO_BOX = 'relative flex aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-xl bg-ink-900 sm:aspect-[16/9] sm:w-full'

/** 'Tonight', a true badge on its own navy backing; under the illustrative chip when the photograph carries one. */
function TonightBadge({ below }: { below: boolean }) {
  return (
    <span
      data-badge="tonight"
      className={`pointer-events-none absolute left-2 rounded-md bg-ink-900 px-2 py-1 font-display text-[10px] font-extrabold uppercase tracking-wider text-[var(--brand-accent)] sm:text-[11px] ${below ? 'top-8' : 'top-2'}`}
    >
      Tonight
    </span>
  )
}

function Card({ card }: { card: MarketCard }) {
  return (
    <article className="group relative">
      <Link
        href={card.href}
        prefetch={false}
        className="flex gap-3.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 sm:flex-col sm:gap-0"
      >
        {card.photo ? (
          <span className={PHOTO_BOX}>
            <EventCardMedia src={card.photo.src} alt={card.photo.alt} variant="market-card" />
            {card.photo.illustrative ? <IllustrativeChip small /> : null}
            {card.tonight ? <TonightBadge below={card.photo.illustrative} /> : null}
          </span>
        ) : (
          // The brand panel (law 46 (f) (4)): no lawful photograph, so no picture, only the brand, in a box of its own.
          <span data-brand-panel className={`${PHOTO_BOX} items-center justify-center`}>
            <span aria-hidden="true" className="font-headline text-lg font-extrabold tracking-tight text-white">
              EVENTLINQS<span className="text-[var(--brand-accent)]">.</span>
            </span>
            {card.tonight ? <TonightBadge below={false} /> : null}
          </span>
        )}
        <span className="min-w-0 flex-1 pr-12 sm:pr-0 sm:pt-3">
          <span className="block font-headline text-base font-extrabold leading-snug text-ink-900 [overflow-wrap:anywhere] group-hover:underline sm:text-[17px]">
            {card.title}
          </span>
          <span className="mt-1 block font-display text-sm font-bold text-[var(--brand-accent-strong)]">{card.date}</span>
          {card.venue ? <span className="mt-0.5 block font-display text-sm text-ink-600 [overflow-wrap:anywhere]">{card.venue}</span> : null}
          {card.price ? (
            <span className={`mt-1 block font-display text-sm font-extrabold ${card.free ? 'text-[var(--color-success-strong)]' : 'text-ink-900'}`}>{card.price}</span>
          ) : null}
          {card.category ? <span className="mt-0.5 block font-display text-xs font-semibold text-ink-400">{card.category}</span> : null}
          {card.photo?.credit ? <span className="mt-1 block font-display text-xs text-ink-400 [overflow-wrap:anywhere]">{card.photo.credit}</span> : null}
        </span>
      </Link>
      {/* Save and share beside the link, never inside it. On a phone the heart sits at the row's bottom right; from sm the
          box takes the photograph's own 16:9 shape over it, so the two sit on its bottom right corner at every width. */}
      <div className="pointer-events-none absolute bottom-0 right-0 sm:bottom-auto sm:inset-x-0 sm:top-0 sm:aspect-[16/9]">
        <div className="pointer-events-auto flex gap-2 sm:absolute sm:bottom-2.5 sm:right-2.5">
          <span className="hidden sm:block">
            <ShareEventButton title={card.title} href={card.href} />
          </span>
          <SaveEventButton eventId={card.id} variant="light" className="shadow-[var(--shadow-card)]" />
        </div>
      </div>
    </article>
  )
}

/** Sort, to the whole list of events in this city sorted three ways (the /events search's own sorts). */
function SortMenu({ searchCity }: { searchCity: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-controls="market-sort" onClick={() => setOpen((o) => !o)} className={TOOL}>
        <ArrowUpDown className="h-4 w-4" aria-hidden />
        Sort: Best match
      </button>
      {open ? (
        <ul id="market-sort" className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-[var(--shadow-card)]">
          <li><Link href={`/events?city=${searchCity}&sort=relevance`} prefetch={false} className={MENU_ITEM}>Best match</Link></li>
          <li><Link href={`/events?city=${searchCity}&sort=date_asc`} prefetch={false} className={MENU_ITEM}>Soonest first</Link></li>
          <li><Link href={`/events?city=${searchCity}&sort=price_asc`} prefetch={false} className={MENU_ITEM}>Lowest price first</Link></li>
        </ul>
      ) : null}
    </div>
  )
}

/** 'Browsing events in <city> ▾': the four nearest guides first, then every city; the choice is remembered (el_city). */
function CitySwitch({ current }: { current: { slug: string; name: string } }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="market-city-switch"
        aria-label={`Change city. Current: ${current.name}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1 border-b-[3px] border-[var(--brand-accent)] font-headline text-2xl font-extrabold tracking-tight text-[var(--brand-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 sm:text-3xl"
      >
        {current.name}
        <ChevronDown className="h-5 w-5" aria-hidden />
      </button>
      {open ? (
        <ul id="market-city-switch" className="absolute left-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-[var(--shadow-card)]">
          {SWITCH_CITIES.map((c) => (
            <li key={c.slug}>
              <Link
                href={c.slug === current.slug ? '/' : `/city/${c.slug}`}
                prefetch={false}
                aria-current={c.slug === current.slug ? 'page' : undefined}
                onClick={() => rememberCity({ name: c.name })}
                className={MENU_ITEM}
              >
                {c.name}
              </Link>
            </li>
          ))}
          <li className="border-t border-ink-100">
            <Link href="/cities" prefetch={false} className={MENU_ITEM}>
              Every city
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  )
}

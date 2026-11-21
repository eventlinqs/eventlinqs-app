import { bookingLine, cardPhoto } from '@/lib/events/card-facts'
import { moreDatesLine, whenLine, type Entry, type GuideDays } from '@/lib/events/guide-sections'
import type { DirectoryRow } from '@/lib/events/whats-on-directory'
import { MARKET_TABS, defaultTab, isTonight, marketEntries, type MarketTab } from './marketplace'

/**
 * THE MARKETPLACE GRID, SHAPED ON THE SERVER (law 46; site.html's card: "photo, title, date in gold, venue, price,
 * category, save and share"). Each card is built once from the guide's own row by the guide's own rules: its photograph
 * by cardPhoto (the night's own, else its venue's with its credit, else the labelled illustrative photograph of its kind,
 * else none), its price and where it is booked by bookingLine, its date by whenLine. The browser receives the cards and,
 * per tab, the ordered ids, so it filters nothing and ships none of the ordering code.
 */
export type MarketCard = {
  readonly id: string
  readonly href: string
  readonly title: string
  /** 'Sat 21 Nov · 7:30 pm', and '+ 1 more date' where the listing runs on. */
  readonly date: string
  readonly venue: string | null
  /** 'Free', the price, or where it is booked ('Tickets at Ticketek'); null where nothing is held. */
  readonly price: string | null
  readonly free: boolean
  readonly category: string | null
  readonly photo: { readonly src: string; readonly alt: string; readonly credit: string | null; readonly illustrative: boolean } | null
  readonly tonight: boolean
}

export type MarketGrid = {
  readonly cards: Readonly<Record<string, MarketCard>>
  readonly tabs: Readonly<Record<MarketTab, readonly string[]>>
  readonly initial: MarketTab
}

/** How many cards a tab holds before 'See more' sends the visitor to the city's whole guide. */
export const MARKET_TAB_CAP = 48

export function marketCard(e: Entry, todayKey: string): MarketCard {
  const r = e.row
  const b = bookingLine(r)
  const photo = cardPhoto(r)
  const more = moreDatesLine(e)
  return {
    id: r.id,
    href: r.href,
    title: r.title,
    date: [whenLine(e), more].filter(Boolean).join(' · '),
    venue: r.venue,
    price: r.free ? 'Free' : (b.book ?? b.said),
    free: r.free,
    category: r.category,
    photo: photo ? { src: photo.src, alt: photo.alt, credit: photo.credit, illustrative: photo.illustrative === true } : null,
    tonight: isTonight(r, todayKey),
  }
}

/** Every tab's cards, capped, in law 18's order, and the tab the grid opens on. Pure. */
export function marketGrid(rows: readonly DirectoryRow[], days: GuideDays, cap = MARKET_TAB_CAP): MarketGrid {
  const cards: Record<string, MarketCard> = {}
  const tabs = {} as Record<MarketTab, string[]>
  for (const t of MARKET_TABS) {
    if (t.key === 'for-you') continue
    const entries = marketEntries(rows, t.key, days).slice(0, cap)
    tabs[t.key] = entries.map((e) => {
      if (!cards[e.row.id]) cards[e.row.id] = marketCard(e, days.todayKey)
      return e.row.id
    })
  }
  return { cards, tabs, initial: defaultTab(rows, days) }
}

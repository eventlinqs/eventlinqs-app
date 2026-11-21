import { foldListings, inRange, ownFirst, type Entry, type GuideDays } from '@/lib/events/guide-sections'
import { MARKET_TABS, MARKET_PAGE, SWITCH_CITIES, type MarketTab, type MarketTabItem } from './marketplace-tabs'

export { MARKET_TABS, MARKET_PAGE, SWITCH_CITIES, type MarketTab, type MarketTabItem }
import type { DirectoryRow } from '@/lib/events/whats-on-directory'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'

/**
 * THE MARKETPLACE HOME'S RULES, PURE (law 46; the design engine, DESIGN-ENGINE-LOCKED-21NOV.md section 2: "category
 * circles; 'Browsing events in <city>' switch; date and category tabs ... a grid of event cards ... See more"; Lawal's
 * site.html, C:\dev\EVIDENCE\EL-21NOV\nl-design\whats-on). Every list is the city guide's own rows (discoveryData, the
 * same read, the same visibility rule and the same lawful image rules), filtered here and ordered by law 18's relevance
 * (ownFirst: the organisers' own nights, then the tiers, then the date), one card per listing (foldListings).
 */

/** The rows a tab shows, in the order they came. Pure. */
export function rowsForTab(rows: readonly DirectoryRow[], tab: MarketTab, days: GuideDays): DirectoryRow[] {
  switch (tab) {
    case 'all':
      return [...rows]
    case 'today':
      return rows.filter((r) => inRange(r, 'today', days))
    case 'weekend':
      return rows.filter((r) => inRange(r, 'weekend', days))
    case 'free':
      return rows.filter((r) => r.free)
    default:
      return rows.filter((r) => r.categorySlug === tab)
  }
}

/** One card per listing, law 18's order (the organisers' own first, then relevance, then the date). Pure. */
export function marketEntries(rows: readonly DirectoryRow[], tab: MarketTab, days: GuideDays): Entry[] {
  const shown = rowsForTab(rows, tab, days)
  return foldListings(shown, rows).sort((a, b) => ownFirst(a.row, b.row))
}

/** The tab the grid opens on: This weekend while the weekend holds a night (site.html), else All. Pure. */
export function defaultTab(rows: readonly DirectoryRow[], days: GuideDays): MarketTab {
  return rows.some((r) => inRange(r, 'weekend', days)) ? 'weekend' : 'all'
}

/**
 * 'Tonight', a true badge only (the design engine, section 2: "true badges only"): the night starts today, in the
 * platform's own day, at five in the evening or later. Pure.
 */
export function isTonight(r: Pick<DirectoryRow, 'dayKey' | 'ts' | 'time'>, todayKey: string): boolean {
  if (r.dayKey !== todayKey || !r.time) return false
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: PLATFORM_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(r.ts))
  return hour >= 17
}

/** The category circles, site.html's nine, each to its real landing (/categories/<slug>, one of the live taxonomy's). */
export const CATEGORY_CIRCLES: readonly { readonly key: string; readonly label: string; readonly href: string }[] = [
  { key: 'music', label: 'Music', href: '/categories/music' },
  { key: 'nightlife', label: 'Nightlife', href: '/categories/nightlife' },
  { key: 'comedy', label: 'Comedy', href: '/categories/comedy' },
  { key: 'festival', label: 'Festivals', href: '/categories/festival' },
  { key: 'sports', label: 'Sport', href: '/categories/sports' },
  { key: 'theatre', label: 'Theatre', href: '/categories/theatre' },
  { key: 'family', label: 'Family', href: '/categories/family' },
  { key: 'food-drink', label: 'Food & Drink', href: '/categories/food-drink' },
  { key: 'free', label: 'Free', href: '/events?free=1' },
]

export type PromoSlide = {
  readonly id: string
  readonly kicker: string
  readonly title: string
  /** The headline's second line, in gold (site.html: 'Find what's on' / 'near you'). */
  readonly accent: string
  readonly body: string
  readonly href: string
  readonly action: string
  readonly image: string
  readonly alt: string
  readonly position?: string
}

/**
 * The promo banner's slides (site.html: a rotating banner with dots). Each is a real page and a licensed library
 * photograph (the spine), never a night's own picture standing in for something else; a slide whose photograph is not
 * held is left out, and the banner draws only what remains. Pure: the photographs are handed in.
 */
export function promoSlides(
  photos: { weekend: { src: string; position?: string } | null; free: { src: string; position?: string } | null; sell: { src: string; position?: string } | null },
  cityName: string,
): PromoSlide[] {
  const out: PromoSlide[] = []
  if (photos.weekend) {
    out.push({
      id: 'weekend',
      kicker: 'This weekend in Victoria',
      title: 'Find what\u2019s on',
      accent: 'near you',
      body: 'Festivals, live music, comedy, sport and free things to do.',
      href: '/weekend',
      action: 'Explore this weekend',
      image: photos.weekend.src,
      alt: 'A crowd with raised hands under stage lights',
      position: photos.weekend.position,
    })
  }
  if (photos.free) {
    out.push({
      id: 'free',
      kicker: `Free in ${cityName}`,
      title: 'Free things',
      accent: 'to do',
      body: 'Markets, festivals, sessions and nights out that cost nothing to go to.',
      href: '/events?free=1',
      action: 'See free events',
      image: photos.free.src,
      alt: 'An outdoor stage at golden hour',
      position: photos.free.position,
    })
  }
  if (photos.sell) {
    out.push({
      id: 'sell',
      kicker: 'For organisers',
      title: 'Sell tickets',
      accent: 'on EventLinqs',
      body: 'Reach people looking for what to do, and own every attendee relationship.',
      href: '/organisers',
      action: 'Start selling',
      image: photos.sell.src,
      alt: 'A stage being set for a show',
      position: photos.sell.position,
    })
  }
  return out
}

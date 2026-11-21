/**
 * THE MARKETPLACE HOME'S TABS, PAGE SIZE AND CITY SWITCH (law 46; site.html), in a module that imports nothing, so the
 * browser's grid (src/components/features/home-market/market-browse.tsx) carries only these and never the ordering code
 * (src/lib/home/marketplace.ts re-exports them for the server).
 */

/** A tab that filters the grid in place. 'For you' is a link to /feed, the per-person feed, never a filter here. */
export type MarketTab = 'all' | 'today' | 'weekend' | 'free' | 'music' | 'comedy' | 'sports' | 'family'

export type MarketTabItem = { readonly key: MarketTab; readonly label: string } | { readonly key: 'for-you'; readonly label: string; readonly href: string }

/** site.html's bar, in its order: the dates, Free, then four categories (each a real category slug). */
export const MARKET_TABS: readonly MarketTabItem[] = [
  { key: 'all', label: 'All' },
  { key: 'for-you', label: 'For you', href: '/feed' },
  { key: 'today', label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'free', label: 'Free' },
  { key: 'music', label: 'Music' },
  { key: 'comedy', label: 'Comedy' },
  { key: 'sports', label: 'Sport' },
  { key: 'family', label: 'Family' },
]

/** How many cards a grid shows before See more, and how many each press adds. */
export const MARKET_PAGE = 8

/** The cities the 'Browsing events in' switch offers first (the city guide's quick four), then every city. */
export const SWITCH_CITIES: readonly { readonly slug: string; readonly name: string }[] = [
  { slug: 'melbourne', name: 'Melbourne' },
  { slug: 'geelong', name: 'Geelong' },
  { slug: 'ballarat', name: 'Ballarat' },
  { slug: 'bendigo', name: 'Bendigo' },
]

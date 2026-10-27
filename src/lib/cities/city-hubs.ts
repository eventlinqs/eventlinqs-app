import { isWalkIn } from '@/lib/events/entry-mode'

/**
 * A CITY'S HUBS (the locked plan of 27 October 2026, Sprint 2, item 10: "City
 * hubs: this weekend, free, music, family, nightlife for each city ... Four hubs
 * live, no empty rail").
 *
 * This weekend is the rail the city page already draws. The other four are read
 * from the events that page already reads, by the platform's own taxonomy and
 * nothing invented (Law 0.5): free is the event's own is_free or a walk-in's
 * free entry (WI1); music, family and nightlife are the event_categories slugs
 * of the same names (src/lib/categories/taxonomy.ts). Each "View all" opens the
 * events directory on the same filter, by the parameters it already reads
 * (src/lib/events/url-filters.ts: date=free; src/lib/events/fetchers.ts:
 * category). A hub with no event draws no rail.
 *
 * A leaf: no database.
 */

export type HubEvent = {
  is_free?: boolean | null
  entry_mode?: string | null
  category?: { slug: string | null } | null
}

export type CityHub = {
  key: 'free' | 'music' | 'family' | 'nightlife'
  eyebrow: string
  title: (cityName: string) => string
  href: (citySlug: string) => string
  holds: (event: HubEvent) => boolean
}

const inCategory = (slug: string) => (e: HubEvent) => e.category?.slug === slug

export const CITY_HUBS: readonly CityHub[] = [
  {
    key: 'free',
    eyebrow: 'Free',
    title: (c) => `Free in ${c}`,
    href: (s) => `/events?city=${s}&date=free`,
    holds: (e) => e.is_free === true || isWalkIn(e),
  },
  { key: 'music', eyebrow: 'Music', title: (c) => `Live music in ${c}`, href: (s) => `/events?city=${s}&category=music`, holds: inCategory('music') },
  { key: 'family', eyebrow: 'Family', title: (c) => `Family days out in ${c}`, href: (s) => `/events?city=${s}&category=family`, holds: inCategory('family') },
  { key: 'nightlife', eyebrow: 'Nightlife', title: (c) => `Nightlife in ${c}`, href: (s) => `/events?city=${s}&category=nightlife`, holds: inCategory('nightlife') },
]

/** The hubs with at least one event, each with its events in the order given, at most `cap`. */
export function cityHubRails<E extends HubEvent>(events: readonly E[], cap = 12): { hub: CityHub; events: E[] }[] {
  return CITY_HUBS.map((hub) => ({ hub, events: events.filter(hub.holds).slice(0, cap) })).filter((r) => r.events.length > 0)
}

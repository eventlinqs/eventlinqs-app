/**
 * AN ORGANISER'S CITY, READ FROM ROWS (train AE, WINDOW 5A, 20 November 2026; the PM's 08:37 item 4, T7).
 *
 * The Organiser Marketing letter (acq_first v1, Lawal's approved email of 18 November 2026) names the city guide its
 * reader's events belong in: "a great addition to our [city] events guide ... eventlinqs.com.au/city/[city]". Until now a
 * city was known only for an organiser linked to a venue, so the seven organisers of 20 November had none in code and were
 * read by hand: Bendigo Symphony Orchestra from the EventLinqs night it was found on, Tipsy Sketching Club from the
 * EventLinqs venue page it was found on. The same three roads, in this order, each a row the platform holds:
 *   1. a venue linked to them (organiser_venues), as before;
 *   2. the EventLinqs page they were found on (organisers.found_on): an event's own city, or a venue's;
 *   3. a published night under their own account (events.organisation_id) that has not ended, the soonest first.
 * Never a guess from a name or an address: no row, no city, and a letter that needs one stays held.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'

type Admin = SupabaseClient<Database>

const EVENT_PAGE = /^https:\/\/(?:www\.)?eventlinqs\.com\.au\/events\/([a-z0-9-]+)\/?$/
const VENUE_PAGE = /^https:\/\/(?:www\.)?eventlinqs\.com\.au\/venues\/([a-z0-9-]+)\/?$/

export interface OrganiserForCity {
  readonly id: string
  readonly found_on: string | null
  readonly organisation_id: string | null
}

/** The EventLinqs page an organiser was found on, as the kind of row it names and its slug; null for any other page. */
export function foundOnPage(foundOn: string | null): { readonly kind: 'event' | 'venue'; readonly slug: string } | null {
  const url = (foundOn ?? '').trim()
  const event = EVENT_PAGE.exec(url)
  if (event) return { kind: 'event', slug: event[1] }
  const venue = VENUE_PAGE.exec(url)
  return venue ? { kind: 'venue', slug: venue[1] } : null
}

/** Each organiser's city slug by the first road that has one (above); an organiser with none is absent. */
export async function organiserCitySlugs(db: Admin, organisers: readonly OrganiserForCity[], now: Date): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (organisers.length === 0) return out
  const ids = organisers.map((o) => o.id)

  // 1. A venue linked to them.
  const links = await db.from('organiser_venues').select('organiser_id, venue_id').in('organiser_id', ids)
  if (links.error) throw new Error(`their venues could not be read: ${links.error.message}`)
  const venueIds = [...new Set((links.data ?? []).map((l) => l.venue_id))]
  if (venueIds.length > 0) {
    const venues = await db.from('venues').select('id, city_slug').in('id', venueIds).is('removed_at', null)
    if (venues.error) throw new Error(`their venues' cities could not be read: ${venues.error.message}`)
    const cityOf = new Map((venues.data ?? []).filter((v) => v.city_slug).map((v) => [v.id, v.city_slug as string]))
    for (const l of [...(links.data ?? [])].sort((a, b) => a.venue_id.localeCompare(b.venue_id))) {
      const city = cityOf.get(l.venue_id)
      if (city && !out.has(l.organiser_id)) out.set(l.organiser_id, city)
    }
  }

  // 2. The EventLinqs page they were found on.
  const pages = organisers.filter((o) => !out.has(o.id)).map((o) => ({ id: o.id, page: foundOnPage(o.found_on) })).filter((x) => x.page)
  const eventSlugs = pages.filter((x) => x.page!.kind === 'event').map((x) => x.page!.slug)
  const venueSlugs = pages.filter((x) => x.page!.kind === 'venue').map((x) => x.page!.slug)
  const eventCity = new Map<string, string>()
  const venueCity = new Map<string, string>()
  if (eventSlugs.length > 0) {
    const events = await db.from('events').select('slug, city_primary').in('slug', eventSlugs)
    if (events.error) throw new Error(`the nights they were found on could not be read: ${events.error.message}`)
    for (const e of events.data ?? []) if (e.city_primary) eventCity.set(e.slug, e.city_primary)
  }
  if (venueSlugs.length > 0) {
    const venues = await db.from('venues').select('slug, city_slug').in('slug', venueSlugs).is('removed_at', null)
    if (venues.error) throw new Error(`the venue pages they were found on could not be read: ${venues.error.message}`)
    for (const v of venues.data ?? []) if (v.slug && v.city_slug) venueCity.set(v.slug, v.city_slug)
  }
  for (const x of pages) {
    const city = x.page!.kind === 'event' ? eventCity.get(x.page!.slug) : venueCity.get(x.page!.slug)
    if (city) out.set(x.id, city)
  }

  // 3. A published night under their own account still listed (the one listing window, src/lib/events/listing-window.ts:
  // a night is current until it ends), the soonest first.
  const accounts = organisers.filter((o) => !out.has(o.id) && o.organisation_id)
  if (accounts.length > 0) {
    const nights = await db
      .from('events')
      .select('organisation_id, city_primary, start_date, end_date')
      .in('organisation_id', accounts.map((o) => o.organisation_id as string))
      .eq('status', 'published')
      .or(listingWindowOrPredicate(now))
      .not('city_primary', 'is', null)
      .order('start_date')
      .limit(500)
    if (nights.error) throw new Error(`their own nights could not be read: ${nights.error.message}`)
    for (const o of accounts) {
      const n = (nights.data ?? []).find((e) => e.organisation_id === o.organisation_id)
      if (n?.city_primary) out.set(o.id, n.city_primary)
    }
  }
  return out
}

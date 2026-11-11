/**
 * The data the three discovery variants share (Lawal's order of 1 November 2026, 11:14; the brief
 * C:\dev\DESIGN\DISCOVERY-DESIGN-BRIEF-1NOV.md). One read of every listed night, shaped once on the server: the rows of
 * the directory (in day order, Geelong and Melbourne first in each day), the Featured nights of the next seven days with
 * a rights recorded photograph, a small image for a row only where one is authorised, and the day keys the date chips
 * use, all in the platform's own zone.
 */
import type { EventCardData } from '@/components/features/events/event-card'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { RECORDED, readCoverRights } from '@/lib/events/featured-with-recorded-rights'
import { isComposedCover } from '@/lib/events/generated-cover-prefix'
import { toEventCardData, type LedgerRow } from '@/lib/events/ledger-data'
import { isStillListed, weekendWindowUtc } from '@/lib/events/listing-window'
import { addDays, chipsOf, dayKey, directoryDays, type DirectoryRow } from '@/lib/events/whats-on-directory'
import { ownEventIds, readOwnListings, readThumbCredits, withOwnAndCredits } from '@/lib/events/own-listings'
import { createAdminClient } from '@/lib/supabase/admin'
import { withVenueThumbs } from '@/lib/events/venue-thumbs'

/**
 * The day keys the guide's chips and sections use. weekendKeys is EVERY day of the platform's ONE weekend
 * (listing-window.ts weekendWindowUtc, Friday to Sunday since 2 November: Lawal's directive, section 4), from today on,
 * read from the window itself, never a second definition and never only its first and last day.
 */
export type DiscoveryDays = { todayKey: string; tomorrowKey: string; weekendKeys: string[]; weekKeys: string[] }

/** Every day key from the window's first to its last, inclusive, in the platform zone. */
export function windowDayKeys(from: Date, to: Date): string[] {
  const last = dayKey(to, PLATFORM_TIME_ZONE)
  const keys: string[] = []
  for (let k = dayKey(from, PLATFORM_TIME_ZONE); k <= last && keys.length < 7; k = addDays(k, 1)) keys.push(k)
  return keys
}

export function discoveryDays(now: Date): DiscoveryDays {
  const todayKey = dayKey(now, PLATFORM_TIME_ZONE)
  const weekend = weekendWindowUtc(now, PLATFORM_TIME_ZONE)
  return {
    todayKey,
    tomorrowKey: addDays(todayKey, 1),
    weekendKeys: windowDayKeys(weekend.from, weekend.to).filter((k) => k >= todayKey),
    weekKeys: Array.from({ length: 7 }, (_, i) => addDays(todayKey, i)),
  }
}

export async function discoveryData(rows: readonly LedgerRow[], now: Date): Promise<{
  rows: DirectoryRow[]
  featured: EventCardData[]
  days: DiscoveryDays
  categories: { key: string; label: string }[]
}> {
  // Every listed night of every city: the city guide shows ONE city at a time, by the name its venue holds, and widens
  // to nearby places only when the visitor chooses (the city-first directive of 1 November 2026, section 3).
  const listed = rows.filter((r) => isStillListed(r, now))
  const photo = (r: LedgerRow) => Boolean(r.cover_image_url) && !isComposedCover(r.cover_image_url)
  // The organisers' own submissions are read beside the cover rights, in parallel, so the guide waits no longer.
  const [rights, ownListings] = await Promise.all([
    readCoverRights(
      createAdminClient,
      listed.filter((r) => photo(r) && !r.image_credit).map((r) => r.id),
    ),
    readOwnListings(createAdminClient),
  ])
  // THE NIGHT'S OWN PHOTOGRAPH ONLY (round 5 fault 5, the CONTROLLER's 09:20 of 3 November): a venue photograph the image
  // chain applied (image_credit set) is NOT drawn as a night's image on the guide: it shows the venue, never the act, and
  // its CC BY or BY-SA credit lived only in a title attribute nobody sees. It comes off until a credited design is
  // approved (law 7). What remains is a cover whose rights the database records (organiser authorised, separately licensed).
  const authorised = (r: LedgerRow) => photo(r) && !r.image_credit && RECORDED.has(rights.get(r.id) ?? '')
  const thumbs = new Map(listed.filter(authorised).map((r) => [r.id, r.cover_image_url as string]))
  // An organiser's own event (Lawal, 11 November 2026, 16:26) is marked by where it came from, and every photograph carries
  // its credit where the register holds one (src/lib/events/own-listings.ts).
  const dayRows = directoryDays(listed, now, thumbs).flatMap((d) => d.rows)
  const credits = await readThumbCredits(createAdminClient, dayRows, now)
  const flat = await withVenueThumbs(withOwnAndCredits(dayRows, ownEventIds(listed, ownListings), credits))

  // Featured, for the city's slider: the next FORTNIGHT (the CONTROLLER's 16:41 (3)), an authorised photograph, one night
  // of a series, soonest first.
  const seen = new Set<string>()
  const fortnightEnd = now.getTime() + 14 * 24 * 60 * 60 * 1000
  const featured = listed
    .filter((r) => Date.parse(r.start_date) <= fortnightEnd)
    .filter(authorised)
    .filter((r) => {
      const key = r.listing_series_id ?? r.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 24)
    .map((r) => ({ ...toEventCardData(r), cover_rights_recorded: true }))

  return {
    rows: flat,
    featured,
    days: discoveryDays(now),
    categories: chipsOf(flat).filter((c) => c.key !== 'free'),
  }
}

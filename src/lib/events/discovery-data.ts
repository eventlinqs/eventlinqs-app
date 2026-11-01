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
import { thisWeek, toEventCardData, type LedgerRow } from '@/lib/events/ledger-data'
import { isStillListed, weekendWindowUtc } from '@/lib/events/listing-window'
import { addDays, chipsOf, dayKey, directoryDays, type DirectoryRow } from '@/lib/events/whats-on-directory'
import { createAdminClient } from '@/lib/supabase/admin'

export type DiscoveryDays = { todayKey: string; tomorrowKey: string; weekendKeys: string[]; weekKeys: string[] }

export function discoveryDays(now: Date): DiscoveryDays {
  const todayKey = dayKey(now, PLATFORM_TIME_ZONE)
  // The platform's ONE weekend (src/lib/events/listing-window.ts), its days from today on.
  const weekend = weekendWindowUtc(now, PLATFORM_TIME_ZONE)
  const weekendKeys = [dayKey(weekend.from, PLATFORM_TIME_ZONE), dayKey(weekend.to, PLATFORM_TIME_ZONE)]
    .filter((k, i, all) => all.indexOf(k) === i)
    .filter((k) => k >= todayKey)
  return {
    todayKey,
    tomorrowKey: addDays(todayKey, 1),
    weekendKeys,
    weekKeys: Array.from({ length: 7 }, (_, i) => addDays(todayKey, i)),
  }
}

export async function discoveryData(rows: readonly LedgerRow[], now: Date): Promise<{
  rows: DirectoryRow[]
  featured: EventCardData[]
  days: DiscoveryDays
  categories: { key: string; label: string }[]
}> {
  const listed = rows.filter((r) => isStillListed(r, now))
  const photo = (r: LedgerRow) => Boolean(r.cover_image_url) && !isComposedCover(r.cover_image_url)
  const rights = await readCoverRights(
    createAdminClient(),
    listed.filter((r) => photo(r) && !r.image_credit).map((r) => r.id),
  )
  const authorised = (r: LedgerRow) => photo(r) && (Boolean(r.image_credit) || RECORDED.has(rights.get(r.id) ?? ''))
  const thumbs = new Map(listed.filter(authorised).map((r) => [r.id, r.cover_image_url as string]))
  const flat = directoryDays(listed, now, thumbs).flatMap((d) => d.rows)

  // Featured: the next seven days, an authorised photograph, one night of a series, soonest first.
  const seen = new Set<string>()
  const featured = thisWeek(listed, now)
    .filter(authorised)
    .filter((r) => {
      const key = r.listing_series_id ?? r.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 24)
    .map(toEventCardData)

  return {
    rows: flat,
    featured,
    days: discoveryDays(now),
    categories: chipsOf(flat).filter((c) => c.key !== 'free'),
  }
}

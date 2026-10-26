import { createPublicClient } from '@/lib/supabase/public-client'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import type { SeriesRule } from './occurrences'

/**
 * A VENUE'S REGULAR NIGHTS AND THEIR NEXT DATES (WI2 Part 3a), read as a signed
 * out visitor reads them: the series' own policy ("Active series are public",
 * 20261023000010) and the public event rules. A failed read throws, as every
 * read on the venue page does, so a dropped socket is never a venue with no
 * nights.
 */

/** How many next dates the page lists under each night (WI2-PLAN section 9). */
export const NEXT_DATES_SHOWN = 8

export type VenueSeries = {
  id: string
  name: string
  rule: SeriesRule
  day: number
  starts_at: string
  ends_at: string | null
  anchor_date: string
  timezone: string
  listing_source: 'organiser' | 'eventlinqs'
  last_checked_on: string | null
  /** The next dated nights, soonest first, at most NEXT_DATES_SHOWN. */
  next: { slug: string; start_date: string }[]
}

export async function readVenueSeries(venueId: string, now: Date = new Date()): Promise<VenueSeries[]> {
  const supabase = createPublicClient()
  const series = await readOrThrow('the venue regular nights', () =>
    supabase
      .from('event_series')
      .select('id, name, rule, day, starts_at, ends_at, anchor_date, timezone, listing_source, last_checked_on')
      .eq('venue_id', venueId)
      .eq('status', 'active')
      .order('day', { ascending: true })
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(50),
  )
  const rows = (series ?? []) as Omit<VenueSeries, 'next'>[]
  if (rows.length === 0) return []

  const dated = await readOrThrow('the regular nights next dates', () =>
    supabase
      .from('events')
      .select('slug, start_date, listing_series_id')
      .match(PUBLIC_EVENT_MATCH)
      .in('listing_series_id', rows.map((r) => r.id))
      .or(listingWindowOrPredicate(now))
      .order('start_date', { ascending: true })
      .order('id', { ascending: true })
      .limit(rows.length * NEXT_DATES_SHOWN),
  )
  const bySeries = new Map<string, { slug: string; start_date: string }[]>()
  for (const e of (dated ?? []) as { slug: string; start_date: string; listing_series_id: string | null }[]) {
    if (!e.listing_series_id) continue
    const list = bySeries.get(e.listing_series_id) ?? []
    if (list.length < NEXT_DATES_SHOWN) list.push({ slug: e.slug, start_date: e.start_date })
    bySeries.set(e.listing_series_id, list)
  }
  // A night with no date ahead says nothing useful on the page, so it is left out.
  return rows.map((r) => ({ ...r, next: bySeries.get(r.id) ?? [] })).filter((r) => r.next.length > 0)
}

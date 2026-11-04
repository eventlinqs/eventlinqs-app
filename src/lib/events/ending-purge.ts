/**
 * NO CACHED PAGE OUTLIVES A NIGHT IT LISTS (the CONTROLLER's 11:55 of 4 November 2026: the health sentinel read ended
 * library sessions on /city/geelong and /city/bendigo at 11:40 on 3 and 4 November, from edge cached renders made before
 * they ended, 'Age: 717, X-Vercel-Cache: STALE'; Next.js's expireTime cannot be relied on to bound that on Vercel).
 *
 * Two halves make the promise exact, whatever the page's age:
 *   1. a rendered public list carries a night only while it has LIST_END_LEAD_MS left to run (listing-window.ts);
 *   2. this, run by the existing five minute cron (/api/cron/publish-scheduled), purges every page that lists a night
 *      whose end falls inside that lead, BEFORE the end: every end has a run inside its lead (the lead is longer than
 *      the interval), and the page rendered after the purge no longer carries the night (half 1).
 * The purge is the event surfaces' own (revalidate-event.ts markEventPaths: the event page, the home, /events, its city
 * guide, its suburb pages, its state page, its category, communities and organiser), so one list of surfaces holds.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { LIST_END_LEAD_MS, listingUntil } from '@/lib/events/listing-window'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { revalidateEventSurfacesFromRouteHandlerById } from '@/lib/events/revalidate-event'

export type EndingRow = { readonly id: string; readonly start_date: string; readonly end_date: string | null; readonly timezone: string | null }

/** The nights whose list end falls in [now, now + lead): the ones a cached page must lose before this run's next. */
export function endingWithinLead(rows: readonly EndingRow[], now: Date, leadMs: number = LIST_END_LEAD_MS): string[] {
  const from = now.getTime()
  const to = from + leadMs
  return [...new Set(rows.filter((r) => {
    const until = listingUntil(r).getTime()
    return until >= from && until < to
  }).map((r) => r.id))]
}

const HOUR = 60 * 60 * 1000

/** Read the nights ending inside the lead and purge the surfaces that list each; a failed read throws, never guesses. */
export async function purgeSurfacesOfNightsEnding(admin: SupabaseClient, now: Date = new Date()): Promise<{ ending: number; paths: number }> {
  const from = now.toISOString()
  const to = new Date(now.getTime() + LIST_END_LEAD_MS).toISOString()
  const withEnd = await admin
    .from('events')
    .select('id, start_date, end_date, timezone')
    .match(PUBLIC_EVENT_MATCH)
    .gte('end_date', from)
    .lt('end_date', to)
  if (withEnd.error) throw new Error(`the nights ending now could not be read: ${withEnd.error.message}`)
  // A night with no end listed until the end of its own day: those that start within a day and a half either side.
  const noEnd = await admin
    .from('events')
    .select('id, start_date, end_date, timezone')
    .match(PUBLIC_EVENT_MATCH)
    .is('end_date', null)
    .gte('start_date', new Date(now.getTime() - 36 * HOUR).toISOString())
    .lte('start_date', new Date(now.getTime() + 12 * HOUR).toISOString())
  if (noEnd.error) throw new Error(`the nights with no end time could not be read: ${noEnd.error.message}`)
  const ids = endingWithinLead([...((withEnd.data ?? []) as EndingRow[]), ...((noEnd.data ?? []) as EndingRow[])], now)
  let paths = 0
  for (const id of ids) paths += (await revalidateEventSurfacesFromRouteHandlerById(admin, id)).length
  return { ending: ids.length, paths }
}

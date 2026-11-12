import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { ownHost } from './own-host'

/**
 * AN ORGANISER'S OWN PUBLIC NIGHTS, ONE READER (the PM, 12 November 2026, 14:12: "twenty a day ... lawfully"; the
 * twenty's letters name an organiser's own night, never anything invented). Used by the day's drafter
 * (./twenty-drafts.ts) and the organiser's photo page (src/lib/listings/photo-permission.ts), so both read the same.
 *
 * A night is theirs when it is public, not ended, and:
 *   1. it is at a venue they run (organiser_venues), or
 *   2. it is under their own account (their organisation), or
 *   3. its own booking page is on their own website: the link the listing sends a buyer to is their site (./own-host.ts
 *      says what counts; a shared ticketing, social, government or education host never does, since many organisers
 *      sell or publish there). This is how a promoter's nights at a hired venue are theirs without linking them to the
 *      venue, which would claim every other organiser's nights there.
 * Soonest first, each night once.
 */

type Admin = SupabaseClient<Database>

export interface OwnNight {
  readonly eventId: string
  readonly slug: string
  readonly title: string
  readonly startDate: string
  readonly timezone: string | null
  readonly venueName: string | null
  readonly isFree: boolean | null
}

type Row = { id: string; slug: string; title: string; start_date: string; timezone: string | null; venue_name: string | null; is_free: boolean | null }
const COLUMNS = 'id, slug, title, start_date, timezone, venue_name, is_free'

export async function readTheirNights(
  db: Admin,
  organiser: { readonly id: string; readonly organisation_id: string | null; readonly website_url: string | null },
  now: Date,
  limit: number,
): Promise<OwnNight[]> {
  const plain = db as unknown as SupabaseClient
  const visible = (column: 'id' | 'venue_id' | 'organisation_id', values: string[]) =>
    applyPublicEventVisibility(plain.from('events').select(COLUMNS), { now, includeExternal: true })
      .in(column, values)
      .gt('end_date', now.toISOString())
      .order('start_date', { ascending: true })
      .limit(limit)

  const rows: Row[] = []
  const take = async (column: 'id' | 'venue_id' | 'organisation_id', values: string[]) => {
    if (values.length === 0) return
    const r = await visible(column, values)
    if (r.error) throw new Error(`their nights could not be read: ${r.error.message}`)
    rows.push(...((r.data ?? []) as Row[]))
  }

  const venues = await db.from('organiser_venues').select('venue_id').eq('organiser_id', organiser.id)
  if (venues.error) throw new Error(`their venues could not be read: ${venues.error.message}`)
  await take('venue_id', (venues.data ?? []).map((v) => v.venue_id as string))
  await take('organisation_id', organiser.organisation_id ? [organiser.organisation_id] : [])

  const host = ownHost(organiser.website_url)
  if (host) {
    const ids = new Set<string>()
    for (const pattern of [`%://${host}/%`, `%://www.${host}/%`, `%://${host}`, `%://www.${host}`]) {
      const links = await db.from('event_booking_links').select('event_id').ilike('url', pattern).limit(500)
      if (links.error) throw new Error(`their booking links could not be read: ${links.error.message}`)
      for (const l of links.data ?? []) ids.add(l.event_id as string)
      const direct = await plain.from('events').select('id').ilike('external_ticket_url', pattern).gt('end_date', now.toISOString()).limit(500)
      if (direct.error) throw new Error(`their booking pages could not be read: ${direct.error.message}`)
      for (const e of direct.data ?? []) ids.add(e.id as string)
    }
    const list = [...ids]
    for (let i = 0; i < list.length; i += 200) await take('id', list.slice(i, i + 200))
  }

  const seen = new Set<string>()
  return rows
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((r) => ({ eventId: r.id, slug: r.slug, title: r.title, startDate: r.start_date, timezone: r.timezone, venueName: r.venue_name, isFree: r.is_free }))
}

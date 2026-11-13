import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { onOwnHost, ownHost } from './own-host'

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
 *   4. it is under an organisation the FOUNDER holds for them: Lawal lists a night himself, in an organisation his own
 *      account owns, named for them and carrying their own website (AMCF, the festival at Fed Square, 26 October
 *      2026; its contact's photo page said "No nights of yours are listed ahead" for the festival of 20 November, found
 *      12 November 2026, 21:18). Their own website is the key, read by ./own-host.ts as in 3: an organisation with no
 *      website (EventLinqs listings) is never theirs, and one a stranger owns never is, since only the founder's own are
 *      read. READING ONLY: it links nothing and records no claim, because an organisation is joined to an organiser
 *      only by the claim flow (migration 20261101132001), and a link would read in the funnel as their own account.
 * Soonest first, each night once.
 */

/** The organisations an enabled founder account holds for an organiser: ones whose own website is the organiser's host. */
async function heldForThem(db: Admin, host: string): Promise<string[]> {
  const founders = await db.from('admin_users').select('id').eq('role', 'super_admin').is('disabled_at', null).limit(10)
  if (founders.error) throw new Error(`the founder accounts could not be read: ${founders.error.message}`)
  const owners = (founders.data ?? []).map((f) => f.id as string)
  if (owners.length === 0) return []
  const held = await db.from('organisations').select('id, website').in('owner_id', owners).not('website', 'is', null).limit(500)
  if (held.error) throw new Error(`the organisations held for them could not be read: ${held.error.message}`)
  return (held.data ?? [])
    .filter((g) => {
      const site = String(g.website ?? '').trim()
      return site !== '' && ownHost(/^https?:\/\//i.test(site) ? site : `https://${site}`) === host
    })
    .map((g) => g.id as string)
}

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
    await take('organisation_id', (await heldForThem(db, host)).filter((id) => id !== organiser.organisation_id))
    const ids = new Set<string>()
    // Their host, its www, or a subdomain of it (their own box office); each match is confirmed on the URL's own hostname
    // (onOwnHost), so a link that only mentions their host in its path or query is never theirs.
    for (const pattern of [`%://${host}/%`, `%://www.${host}/%`, `%://${host}`, `%://www.${host}`, `%.${host}/%`, `%.${host}`]) {
      const links = await db.from('event_booking_links').select('event_id, url').ilike('url', pattern).limit(500)
      if (links.error) throw new Error(`their booking links could not be read: ${links.error.message}`)
      for (const l of links.data ?? []) if (onOwnHost(l.url as string, host)) ids.add(l.event_id as string)
      const direct = await plain.from('events').select('id, external_ticket_url').ilike('external_ticket_url', pattern).gt('end_date', now.toISOString()).limit(500)
      if (direct.error) throw new Error(`their booking pages could not be read: ${direct.error.message}`)
      for (const e of direct.data ?? []) if (onOwnHost(e.external_ticket_url as string | null, host)) ids.add(e.id as string)
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

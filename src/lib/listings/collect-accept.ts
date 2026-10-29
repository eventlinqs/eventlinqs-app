import type { SupabaseClient } from '@supabase/supabase-js'
import { providerOf } from '@/lib/events/booking-links'
import type { FoundLink } from './collect'

/**
 * ACCEPTING A FOUND LINK ON A LISTED NIGHT: one writer for a person's accept on /admin/collected and the partner rule
 * in the collection run (./collect-run.ts). The links go in as curated links (WI3's event_booking_links), after the
 * ones the event already carries, never repeating an address it holds; the database picks the button and never lets
 * a curated link be the organiser's own.
 */

export type CuratedLinkRow = {
  event_id: string
  provider: string
  url: string
  kind: 'tickets' | 'presale' | 'sold_out'
  availability: FoundLink['availability']
  price_from_cents: number | null
  price_checked_at: string | null
  set_by: 'curated'
  position: number
}

/** The rows to insert: only addresses the event does not hold, numbered after its last position. */
export function curatedLinkRows(eventId: string, held: readonly { url: string; position: number }[], links: readonly FoundLink[], foundAt: string): CuratedLinkRow[] {
  const urls = new Set(held.map((l) => l.url))
  let position = Math.max(-1, ...held.map((l) => Number(l.position))) + 1
  return links
    .filter((l) => !urls.has(l.url))
    .map((l) => ({
      event_id: eventId,
      provider: providerOf(l.url),
      url: l.url,
      kind: l.availability === 'sold_out' ? 'sold_out' : l.availability === 'not_yet' ? 'presale' : 'tickets',
      availability: l.availability,
      price_from_cents: l.priceFromCents,
      price_checked_at: l.priceFromCents === null ? null : foundAt,
      set_by: 'curated',
      position: position++,
    }))
}

export async function addCuratedLinks(db: SupabaseClient, eventId: string, links: readonly FoundLink[], foundAt: string): Promise<number> {
  const { data: held, error } = await db.from('event_booking_links').select('url, position').eq('event_id', eventId)
  if (error) throw new Error(`booking links could not be read: ${error.message}`)
  const rows = curatedLinkRows(
    eventId,
    (held ?? []).map((l) => ({ url: l.url as string, position: Number(l.position) })),
    links,
    foundAt,
  )
  if (rows.length === 0) return 0
  const { error: ierr } = await db.from('event_booking_links').insert(rows)
  if (ierr) throw new Error(`booking links could not be written: ${ierr.message}`)
  return rows.length
}

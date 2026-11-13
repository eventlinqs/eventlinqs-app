import type { SupabaseClient } from '@supabase/supabase-js'
import { sameNightAlike } from './venue-alike'

/**
 * A CHANGE THAT WAS NO CHANGE IS CLOSED BY THE ENGINE (the Event Discovery Engine, part (e); 13 November 2026). Before the
 * matcher read one place written two ways as one (./venue-alike.ts), 137 nights waited for a person as 'venue_changed'
 * though each named the very venue it is listed at, at the very same start ('Rod Laver Arena, Melbourne' against 'Rod
 * Laver Arena'). Each turn the engine takes the waiting changes, and closes each that is the same night as its listing by
 * the same rule the collector now merges by: refused, with its reason said, no reviewer named, exactly as the run already
 * closes a night that passed before review (collect-store.ts expirePassed). Its next read merges its links into the
 * listing. A real move (another venue, another start) is never touched: it stays for the resolver.
 */
export const NO_CHANGE = 'the same night as its listing, read again: no change of venue'
export const FALSE_CHANGES_PER_TURN = 200

type Waiting = { id: string; event_id: string | null; title: string; venue_name: string | null; venue_address: string | null; starts_at: string }
type Listed = { id: string; title: string; start_date: string; venue_name: string | null; venue_address: string | null }

/** The waiting changes that are no change, by the collector's own rule. Pure. */
export function noChanges(waiting: readonly Waiting[], listed: ReadonlyMap<string, Listed>): string[] {
  const out: string[] = []
  for (const w of waiting) {
    const l = w.event_id ? listed.get(w.event_id) : undefined
    if (!l) continue
    const k = { venueId: null, venueName: l.venue_name ?? '', venueAddress: l.venue_address, title: l.title, startsAt: l.start_date }
    const e = { venueId: null, venueName: w.venue_name ?? '', venueAddress: w.venue_address, title: w.title, startsAt: w.starts_at }
    if (sameNightAlike(k, e)) out.push(w.id)
  }
  return out
}

export async function closeFalseChanges(db: SupabaseClient, now: Date, perTurn = FALSE_CHANGES_PER_TURN): Promise<{ read: number; closed: number }> {
  const { data, error } = await db
    .from('listing_candidates')
    .select('id, event_id, title, venue_name, venue_address, starts_at')
    .eq('status', 'waiting')
    .contains('reasons', ['venue_changed'])
    .order('found_at', { ascending: true })
    .limit(perTurn)
  if (error) throw new Error(`the waiting changes could not be read: ${error.message}`)
  const waiting = (data ?? []) as Waiting[]
  const ids = [...new Set(waiting.map((w) => w.event_id).filter((v): v is string => !!v))]
  if (ids.length === 0) return { read: waiting.length, closed: 0 }
  const { data: events, error: eErr } = await db.from('events').select('id, title, start_date, venue_name, venue_address').in('id', ids)
  if (eErr) throw new Error(`their listings could not be read: ${eErr.message}`)
  const close = noChanges(waiting, new Map(((events ?? []) as Listed[]).map((e) => [e.id, e])))
  if (close.length === 0) return { read: waiting.length, closed: 0 }
  const { data: closed, error: uErr } = await db
    .from('listing_candidates')
    .update({ status: 'refused', refused_because: NO_CHANGE, reviewed_at: now.toISOString() })
    .in('id', close)
    .eq('status', 'waiting')
    .select('id')
  if (uErr) throw new Error(`the false changes could not be closed: ${uErr.message}`)
  return { read: waiting.length, closed: (closed ?? []).length }
}

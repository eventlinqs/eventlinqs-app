import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * THE TWO WRITES OF A NIGHT THAT LEFT ITS SOURCE'S LIST (./left-source.ts; the PM's 07:00 of 15 November 2026, item 4 (b),
 * the BRAZJAZ fix). A hold hides the night at once: private, and a 'left_source' night hold naming the list that no longer
 * carries it (20261115091001). Never deleted. A release shows it again only when the same source's list carries it again
 * and no other hold stands on it; the hold walk never releases a 'left_source' hold (./hold-walk-run.ts), so a night whose
 * own page lingers after the list dropped it is not shown again and hidden again each day.
 */
export type LeftRow = { eventId: string; seriesId: string; sourceId: string; listUrl: string }

const DAY_MS = 24 * 60 * 60 * 1000

export async function holdLeftSource(db: SupabaseClient, rows: readonly LeftRow[], at: Date): Promise<number> {
  let held = 0
  for (const r of rows) {
    const { data: open, error: openError } = await db.from('listing_holds').select('id').eq('event_id', r.eventId).is('released_at', null).limit(1)
    if (openError) throw new Error(`the open holds could not be read: ${openError.message}`)
    const { error: hideError } = await db.from('events').update({ visibility: 'private' }).eq('id', r.eventId).eq('visibility', 'public').eq('status', 'published')
    if (hideError) throw new Error(`the night could not be held: ${hideError.message}`)
    if (!open || open.length === 0) {
      const { error: holdError } = await db.from('listing_holds').insert({
        event_id: r.eventId,
        series_id: r.seriesId,
        field: 'start',
        scope: 'night',
        reason: 'left_source',
        readings: [{ url: r.listUrl, read: 'the list no longer carries this night', read_at: at.toISOString(), by: `collection run, source ${r.sourceId}` }],
        next_source: r.listUrl,
        next_check_at: new Date(at.getTime() + DAY_MS).toISOString(),
      })
      if (holdError) throw new Error(`the hold could not be written: ${holdError.message}`)
    }
    held += 1
  }
  return held
}

export async function releaseLeftSource(db: SupabaseClient, eventIds: readonly string[], sourceId: string, at: Date): Promise<number> {
  if (eventIds.length === 0) return 0
  const { data: holds, error } = await db
    .from('listing_holds')
    .select('id, event_id')
    .in('event_id', [...eventIds])
    .eq('reason', 'left_source')
    .is('released_at', null)
  if (error) throw new Error(`the left source holds could not be read: ${error.message}`)
  let released = 0
  for (const h of holds ?? []) {
    const { error: relError } = await db
      .from('listing_holds')
      .update({ released_at: at.toISOString(), released_by: `collection run, source ${sourceId}: its list carries the night again` })
      .eq('id', h.id)
      .is('released_at', null)
    if (relError) throw new Error(`the hold could not be released: ${relError.message}`)
    const { data: others, error: othersError } = await db.from('listing_holds').select('id').eq('event_id', h.event_id).is('released_at', null).limit(1)
    if (othersError) throw new Error(`the other holds could not be read: ${othersError.message}`)
    if (!others || others.length === 0) {
      const { error: showError } = await db.from('events').update({ visibility: 'public' }).eq('id', h.event_id).eq('visibility', 'private').eq('status', 'published')
      if (showError) throw new Error(`the night could not be shown again: ${showError.message}`)
    }
    released += 1
  }
  return released
}

/** An open 'left_source' hold as the re-read reads it. */
export type LeftHold = { readonly id: string; readonly eventId: string | null; readonly readings: readonly unknown[] | null }

/** The readings a hold keeps: its first (why it was held) and the newest six, a week of daily reads. */
const READINGS_KEPT = 7

/**
 * A WHOLE READ OF A LIST THAT STILL DOES NOT CARRY A HELD NIGHT IS WRITTEN ON ITS HOLD (main's engine verifier on
 * e5b4b6e08, 19 November 2026, 5.52 pm: 'FAIL open hold ddc9d602 (Humanoid Fighting Championship): its next check
 * (2026-11-18T06:25:21.297+00:00) is more than a day overdue'). The collection run re-read Margaret Court Arena's list that
 * day, but a held night is private and nightsThatLeft passes only public nights, so the re-read left no trace and the hold
 * read as never checked. Each whole read now adds its reading to every open 'left_source' hold naming the list whose night
 * it does not carry, and moves that hold's next check a day on; a night the list carries again is released by
 * releaseLeftSource, never here. Pure: what to write on each hold.
 */
export function leftSourceRereads(
  holds: readonly LeftHold[],
  input: { readonly sourceId: string; readonly listUrl: string; readonly carried: ReadonlySet<string>; readonly at: Date },
): { readonly id: string; readonly readings: unknown[]; readonly nextCheckAt: string }[] {
  const reading = { url: input.listUrl, read: 'read again: the list still does not carry this night', read_at: input.at.toISOString(), by: `collection run, source ${input.sourceId}` }
  return holds
    .filter((h) => h.eventId !== null && !input.carried.has(h.eventId))
    .map((h) => {
      const all = [...(h.readings ?? []), reading]
      return { id: h.id, readings: all.length > READINGS_KEPT ? [all[0], ...all.slice(-(READINGS_KEPT - 1))] : all, nextCheckAt: new Date(input.at.getTime() + DAY_MS).toISOString() }
    })
}

/** Writes leftSourceRereads on production's open holds naming this list; returns how many were written. */
export async function recordLeftSourceRereads(
  db: SupabaseClient,
  input: { readonly sourceId: string; readonly listUrl: string; readonly carried: ReadonlySet<string>; readonly at: Date },
): Promise<number> {
  const { data, error } = await db.from('listing_holds').select('id, event_id, readings').eq('reason', 'left_source').eq('next_source', input.listUrl).is('released_at', null)
  if (error) throw new Error(`the open left source holds could not be read: ${error.message}`)
  const holds = ((data ?? []) as { id: string; event_id: string | null; readings: unknown[] | null }[]).map((h) => ({ id: h.id, eventId: h.event_id, readings: h.readings }))
  let written = 0
  for (const w of leftSourceRereads(holds, input)) {
    const { error: upError } = await db.from('listing_holds').update({ readings: w.readings, next_check_at: w.nextCheckAt }).eq('id', w.id).is('released_at', null)
    if (upError) throw new Error(`the re-read could not be written on hold ${w.id}: ${upError.message}`)
    written += 1
  }
  return written
}

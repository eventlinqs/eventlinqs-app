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

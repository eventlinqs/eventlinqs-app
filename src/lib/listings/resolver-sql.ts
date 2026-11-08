import type { Reading } from './resolver'

/**
 * THE RESOLVER'S WRITES, AS ONE REVIEWED FILE (operating rule 4 of 25 September 2026: a production write is a script with a dry
 * run first, applied on APPLY, logged; the CONTROLLER's 10:50 of 7 November 2026). Each ruling of scripts/verify/resolve-run.mts
 * becomes statements in one begin and rollback file for scripts/ops/apply-reviewed-sql-production.mjs:
 *   correct / resource  the official page's value written to that night's link (price and checked time, or status)
 *   hold, fact          a price withheld (the price and its checked time cleared together, as the table requires, so the
 *                       page shows 'See tickets' until a read confirms it; the hold's readings keep what each page stated)
 *   hold, night         the dated night made private (hidden from every public surface), never deleted
 * and every hold a row in public.listing_holds (migration 20261107120001) with the pages read. A start, venue or session is
 * never corrected here: those are held (LAW 19 section 4 asks two consecutive reads before a date, time or venue moves). Pure.
 */
export type Ruled = {
  eventId: string
  seriesId: string | null
  field: 'start' | 'session' | 'venue' | 'price' | 'status'
  /** The booking link the value belongs to, for a price or a status. */
  linkUrl: string | null
  ruling: 'keep' | 'correct' | 'resource' | 'hold'
  value: string | null
  scope: 'fact' | 'night' | null
  reason: 'officials_disagree' | 'no_official_page' | null
  readings: Reading[]
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`
const STATUS = new Set(['on_sale', 'not_yet', 'sold_out', 'dead'])

export function resolverSql(rows: readonly Ruled[]): string {
  const out: string[] = ['begin;', "-- The resolver's corrections and holds (scripts/verify/resolve-run.mts --emit-sql), for apply-reviewed-sql-production.mjs."]
  for (const r of rows) {
    const id = q(r.eventId)
    if ((r.ruling === 'correct' || r.ruling === 'resource') && r.value !== null && r.linkUrl) {
      if (r.field === 'start' || r.field === 'venue' || r.field === 'session') {
        out.push(`-- ${r.field} of ${r.eventId}: the official page states ${r.value}; it moves only on a second consecutive read (LAW 19 (d)).`)
      } else if (r.field === 'price' && /^\d+$/.test(r.value)) {
        out.push(`update public.event_booking_links set price_from_cents = ${r.value}, price_checked_at = now() where event_id = ${id} and url = ${q(r.linkUrl)};`)
      } else if (r.field === 'status' && STATUS.has(r.value)) {
        out.push(`update public.event_booking_links set availability = ${q(r.value)} where event_id = ${id} and url = ${q(r.linkUrl)};`)
      }
      continue
    }
    if (r.ruling !== 'hold' || !r.scope || !r.reason) continue
    if (r.scope === 'night') out.push(`update public.events set visibility = 'private' where id = ${id} and visibility = 'public';`)
    // Both columns at once: the table holds a price only with its check time (event_booking_links_price_with_its_check);
    // what each page stated stays in the hold's readings.
    else if (r.field === 'price') out.push(`update public.event_booking_links set price_from_cents = null, price_checked_at = null where event_id = ${id};`)
    // A hold is never left hanging (CONTROLLER 16:55 (1), migration 20261107170001): its next action is its first page, read
    // again a day on; the walk (src/lib/listings/hold-walk.ts) moves it on from there.
    const next = r.readings[0]?.url ?? r.linkUrl
    out.push(
      `insert into public.listing_holds (event_id, series_id, field, scope, reason, readings, next_source, next_check_at) values (${id}, ${r.seriesId ? q(r.seriesId) : 'null'}, ${q(r.field)}, ${q(r.scope)}, ${q(r.reason)}, ${q(JSON.stringify(r.readings))}::jsonb, ${next ? q(next) : 'null'}, now() + interval '1 day');`,
    )
  }
  if (rows.some((r) => r.ruling === 'hold' && r.scope && r.reason)) out.push('select count(*) as open_holds from public.listing_holds where released_at is null;')
  out.push('rollback;')
  return out.join('\n') + '\n'
}

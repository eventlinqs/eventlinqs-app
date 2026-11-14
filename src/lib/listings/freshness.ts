/**
 * FRESHNESS BY DISTANCE, the same arithmetic as the database's listing_fresh_from_reads (supabase/migrations/
 * 20261115091001_same_day_verification.sql; Lawal, 15 November 2026, 06:03 and 06:50, the PM's 07:00 item 4 (c)), for the
 * readers that judge from outside it: the engine verifier (scripts/verify/engine-verifier.mts) and tests. A listed night
 * is fresh from its newest agreeing read for as long as its distance allows:
 *   more than 30 days out   30 days from the read
 *   8 to 30 days out        7 days
 *   2 to 7 days out         2 days
 *   its last 2 days         2 days, but never past 06:00 on its own day unless the read was made on its own day
 * With no agreeing read it is never fresh. The two are kept equal by tests/unit/listings/freshness.test.ts, which states
 * the migration's own lines. Pure.
 */
const DAY = 24 * 3_600_000

/** 00:00 on the instant's own calendar day in the zone, as an instant. */
export function startOfDayIn(at: Date, zone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(at)
    .reduce<Record<string, string>>((m, p) => ((m[p.type] = p.value), m), {})
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  const offset = wall - Math.floor(at.getTime() / 1000) * 1000
  const midnightWall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  return new Date(midnightWall - offset)
}

/** Until when a night starting at `start` is fresh, its newest agreeing read at `read` (null: never). */
export function freshUntil(read: Date | null, start: Date, zone = 'Australia/Melbourne'): Date {
  if (!read) return new Date(0)
  const r = read.getTime()
  const s = start.getTime()
  const daystart = startOfDayIn(start, zone).getTime()
  if (r + 30 * DAY < s - 30 * DAY) return new Date(r + 30 * DAY)
  const b = Math.max(r + 7 * DAY, s - 30 * DAY)
  if (b < s - 7 * DAY) return new Date(b)
  const c = Math.max(r + 2 * DAY, s - 7 * DAY)
  if (c < s - 2 * DAY) return new Date(c)
  if (r < daystart) return new Date(Math.min(Math.max(r + 2 * DAY, s - 2 * DAY), daystart + 6 * 3_600_000))
  return new Date(Math.max(r + 2 * DAY, s + DAY))
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { ACQ_DAILY_TARGET } from './acq-target'
import { readAcqPool } from './acq-pool'

type Admin = SupabaseClient<Database>

/**
 * A SEND DAY UNDER THE FLOOR IS SAID, WITH ITS CAUSE, EVERY MORNING (the PM's 00:17 of 26 November 2026, item D: "an alert
 * in the 08:00 report ... when a send day ends under the floor, with the count and the cause in one line ..., and when the
 * pool of eligible organisers for the next 7 days is under 10"; Lawal's directive of 00:21, item I: "Acquisition targets
 * being missed"). From 22 to 25 November no first letter went for three send days and nothing said so: the sender ran
 * every fifteen minutes and found an empty queue. This line reads yesterday's first letters (ACQ-FIRST) as production
 * holds them, says the count against law 38's floor, and when under it, the stage that came up short: nothing drafted,
 * letters drafted but held, or letters queued that did not go; and the pool (./acq-pool.ts) when it is under the floor.
 */
export type FloorDay = {
  readonly day: string
  readonly sendDay: boolean
  readonly sent: number
  readonly drafted: number
  readonly held: number
  readonly queued: number
  readonly pool: number | null
}

/** The line. Pure. */
export function firstLetterFloorLine(d: FloorDay): string {
  const floor = ACQ_DAILY_TARGET
  const pool =
    d.pool === null
      ? ' The pool could not be read.'
      : d.pool < floor
        ? ` UNDER THE FLOOR AHEAD: the pool of organisers never written in the four guide cities holds ${d.pool}, under ${floor}; discovery is short.`
        : ` The pool of organisers never written in the four guide cities holds ${d.pool}.`
  if (!d.sendDay) return `${d.day} was not a send day.${pool}`
  if (d.sent >= floor) return `${d.day}: ${d.sent} first letters sent, at or over the floor of ${floor}.${pool}`
  const cause =
    d.drafted === 0
      ? 'nothing was drafted, so the queue was empty'
      : d.held > 0 && d.queued === 0 && d.sent === 0
        ? `${d.drafted} drafted, all still held, so the queue was empty`
        : `${d.drafted} drafted, ${d.held} still held, ${d.queued} queued and not sent`
  return `${d.day}: ${d.sent} of the floor of ${floor} first letters sent, UNDER THE FLOOR: ${cause}.${pool}`
}

const ZONE = 'Australia/Melbourne'
const DAY = 86_400_000

/** The start of a Melbourne day, as an instant. */
function melbourneMidnight(at: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0')
  const sinceMidnight = ((n('hour') * 60 + n('minute')) * 60 + n('second')) * 1000 + at.getMilliseconds()
  return new Date(at.getTime() - sinceMidnight)
}

const ISO_WEEKDAY: Readonly<Record<string, number>> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

/** Yesterday's line, read from production; a read that fails throws, and the report says so. */
export async function readFirstLetterFloor(db: Admin, now: Date): Promise<string> {
  const today = melbourneMidnight(now)
  const yesterday = melbourneMidnight(new Date(today.getTime() - DAY / 2))
  const from = yesterday.toISOString()
  const to = today.toISOString()
  const day = new Intl.DateTimeFormat('en-AU', { timeZone: ZONE, weekday: 'long' }).format(yesterday)
  const weekday = ISO_WEEKDAY[new Intl.DateTimeFormat('en-AU', { timeZone: ZONE, weekday: 'short' }).format(yesterday)] ?? 0
  const sender = await db.from('outreach_sender').select('send_days').eq('id', true).maybeSingle()
  if (sender.error) throw new Error(`the send days could not be read: ${sender.error.message}`)
  const days = (sender.data?.send_days as number[] | null) ?? [1, 2, 3, 4, 5]
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string) => {
    const r = await q
    if (r.error) throw new Error(`${what} could not be counted: ${r.error.message}`)
    return r.count ?? 0
  }
  const acq = () => db.from('outreach_touches').select('id', { count: 'exact', head: true }).eq('comms_subtype', 'ACQ-FIRST')
  const sent = await count(acq().eq('state', 'sent').gte('sent_at', from).lt('sent_at', to), "yesterday's first letters sent")
  const drafted = await count(acq().neq('state', 'void').gte('drafted_at', from).lt('drafted_at', to), "yesterday's first letters drafted")
  const held = await count(acq().eq('state', 'held').gte('drafted_at', from).lt('drafted_at', to), "yesterday's first letters held")
  const queued = await count(acq().eq('state', 'queued').lt('scheduled_for', to), 'first letters queued and not sent')
  const pool = await readAcqPool(db, now).catch(() => null)
  return firstLetterFloorLine({ day, sendDay: days.includes(weekday), sent, drafted, held, queued, pool })
}

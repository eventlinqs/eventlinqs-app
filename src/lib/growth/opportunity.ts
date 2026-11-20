import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { SOLD_STATUSES } from '@/lib/broadcast/sales-attribution'
import { WINDOW_DAYS, scoreEvents, type Dimension, type Raw, type ScoredEvent } from './opportunity-math'

/**
 * THE EVENT OPPORTUNITY SCORE, THE NUMBERS (window 6, 27 October 2026; item 16; the arithmetic and its source are
 * src/lib/growth/opportunity-math.ts). Each of window 5's five dimensions (src/lib/growth/weekly.ts), read for one
 * event over the last 14 days from the same counted rows:
 *
 *   relevance   the days of the 14 the event was published and not yet over (findable).
 *   attention   distinct visitors to its page (ledger demand page views on its slot, by visitor key).
 *   engagement  calendar adds, shares and follows on its slot, and saves of it.
 *   conversion  its paid orders, and presses out to its booking sites (share_link_events 'outbound' on its links).
 *   health      the fee EventLinqs kept on its paid orders less Stripe's processing estimate, where an order records
 *               both (window 5's contribution margin, per event).
 *
 * The events scored are the published ones not over before the window began. Service role: callers are admin pages.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export type OpportunityRow = { id: string; title: string; slug: string; city: string | null; category: string | null } & (
  | { state: 'scored'; score: number; parts: Record<Dimension, number>; raw: Raw }
  | { state: 'needs_two_weeks' }
)

type OpportunityFigures = {
  id: string
  title: string
  slug: string
  city_primary: string | null
  category_id: string | null
  published_at: string | null
  end_date: string
  attention: number
  engaged: number
  conversion: number
  health: number
}

/** growth_opportunity_raw's answer, each row checked: a malformed answer is refused, never read as zeros. */
export function opportunityRowsFrom(data: unknown): OpportunityFigures[] {
  if (!Array.isArray(data)) throw new Error('the opportunity figures answered no list')
  const str = (v: unknown) => typeof v === 'string'
  const strOrNull = (v: unknown) => v === null || typeof v === 'string'
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
  return data.map((r: Record<string, unknown>, i) => {
    if (!r || !str(r.id) || !str(r.title) || !str(r.slug) || !strOrNull(r.city_primary) || !strOrNull(r.category_id) || !strOrNull(r.published_at) || !str(r.end_date))
      throw new Error(`the opportunity figures' row ${i} is not an event`)
    if (!num(r.attention) || !num(r.engaged) || !num(r.conversion) || !num(r.health)) throw new Error(`the opportunity figures' row ${i} holds a figure that is not a count`)
    return r as unknown as OpportunityFigures
  })
}

export async function readOpportunity(now: Date = new Date()): Promise<OpportunityRow[]> {
  const admin = createAdminClient()
  const from = new Date(now.getTime() - WINDOW_DAYS * DAY_MS)
  const fromIso = from.toISOString()
  const nowIso = now.toISOString()

  // ONE READ (law 41, the speed train of 20 November 2026): the database counts every event's rows and answers once
  // (supabase/migrations/20261120190002_growth_opportunity_raw.sql); this used to read them chunk by chunk, each read
  // awaited after the one before, and count every row here. Proved equal on production on all 1,155 events.
  const { data, error } = await admin.rpc('growth_opportunity_raw', { p_from: fromIso, p_now: nowIso, p_sold: [...SOLD_STATUSES] })
  if (error) throw new Error(`the opportunity figures could not be read: ${error.message}`)
  const events = opportunityRowsFrom(data)
  const raws = new Map<string, Raw>()
  for (const e of events) {
    const start = Math.max(from.getTime(), e.published_at ? new Date(e.published_at).getTime() : now.getTime())
    const end = Math.min(now.getTime(), new Date(e.end_date).getTime())
    raws.set(e.id, {
      relevance: Math.max(0, Math.min(WINDOW_DAYS, Math.floor((end - start) / DAY_MS))),
      attention: e.attention,
      engagement: e.engaged,
      conversion: e.conversion,
      health: e.health,
    })
  }

  const scoredEvents: ScoredEvent[] = events.map((e) => ({ id: e.id, city: e.city_primary, category: e.category_id, publishedAt: e.published_at }))
  const byId = new Map(events.map((e) => [e.id, e]))
  return scoreEvents(scoredEvents, raws, now).map((s) => {
    const e = byId.get(s.id)
    const base = { id: s.id, title: e?.title ?? '', slug: e?.slug ?? '', city: e?.city_primary ?? null, category: e?.category_id ?? null }
    return s.state === 'scored' ? { ...base, state: 'scored', score: s.score, parts: s.parts, raw: s.raw } : { ...base, state: 'needs_two_weeks' }
  })
}

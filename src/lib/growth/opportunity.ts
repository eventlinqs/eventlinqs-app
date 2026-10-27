import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
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
// The platform's one definition of a sale, as the reach panel reads it.
const SOLD = new Set<string>(SOLD_STATUSES)

export type OpportunityRow = { id: string; title: string; slug: string; city: string | null; category: string | null } & (
  | { state: 'scored'; score: number; parts: Record<Dimension, number>; raw: Raw }
  | { state: 'needs_two_weeks' }
)

export async function readOpportunity(now: Date = new Date()): Promise<OpportunityRow[]> {
  const admin = createAdminClient()
  const from = new Date(now.getTime() - WINDOW_DAYS * DAY_MS)
  const fromIso = from.toISOString()
  const nowIso = now.toISOString()

  const events = await readEveryRow<{ id: string; title: string; slug: string; city_primary: string | null; category_id: string | null; published_at: string | null; end_date: string }>(
    'the events the opportunity score reads',
    (a, b) =>
      admin
        .from('events')
        .select('id, title, slug, city_primary, category_id, published_at, end_date')
        .eq('status', 'published')
        .gte('end_date', fromIso)
        .order('id', { ascending: true })
        .range(a, b),
  )
  const raws = new Map<string, Raw>()
  const ids = events.map((e) => e.id)
  for (const e of events) {
    const start = Math.max(from.getTime(), e.published_at ? new Date(e.published_at).getTime() : now.getTime())
    const end = Math.min(now.getTime(), new Date(e.end_date).getTime())
    raws.set(e.id, { relevance: Math.max(0, Math.min(WINDOW_DAYS, Math.floor((end - start) / DAY_MS))), attention: 0, engagement: 0, conversion: 0, health: 0 })
  }
  const add = (id: string | null | undefined, d: keyof Raw, n: number) => {
    const r = id ? raws.get(id) : undefined
    if (r) r[d] += n
  }

  for (const chunk of chunkInFilterValues(ids)) {
    const slots = await readEveryRow<{ id: string; source_ref: string }>('the ledger slots of those events', (a, b) =>
      admin.from('ledger_slots').select('id, source_ref').in('source_ref', chunk).order('id', { ascending: true }).range(a, b),
    )
    const eventOfSlot = new Map(slots.map((s) => [s.id, s.source_ref]))
    const visitors = new Map<string, Set<string>>()
    for (const slotChunk of chunkInFilterValues(slots.map((s) => s.id))) {
      const demand = await readEveryRow<{ slot_id: string; demand_action: string | null; visitor_hash: string | null; id: number }>('their demand rows', (a, b) =>
        admin
          .from('ledger_entries')
          .select('id, slot_id, demand_action, visitor_hash')
          .eq('kind', 'demand')
          .in('slot_id', slotChunk)
          .in('demand_action', ['page_view', 'calendar_add', 'share', 'follow'])
          .gte('occurred_at', fromIso)
          .lt('occurred_at', nowIso)
          .order('id', { ascending: true })
          .range(a, b),
      )
      for (const row of demand) {
        const eventId = eventOfSlot.get(row.slot_id)
        if (!eventId) continue
        if (row.demand_action === 'page_view') {
          if (!visitors.has(eventId)) visitors.set(eventId, new Set())
          visitors.get(eventId)?.add(row.visitor_hash ?? `row:${row.id}`)
        } else add(eventId, 'engagement', 1)
      }
    }
    for (const [eventId, set] of visitors) add(eventId, 'attention', set.size)

    const saves = await readEveryRow<{ event_id: string }>('their saves', (a, b) =>
      admin.from('saved_events').select('event_id').in('event_id', chunk).gte('created_at', fromIso).lt('created_at', nowIso).order('id', { ascending: true }).range(a, b),
    )
    for (const s of saves) add(s.event_id, 'engagement', 1)

    const orders = await readEveryRow<{ event_id: string | null; status: string; platform_fee_retained_cents: number | null; stripe_processing_estimate_cents: number | null }>(
      'their orders',
      (a, b) =>
        admin
          .from('orders')
          .select('event_id, status, platform_fee_retained_cents, stripe_processing_estimate_cents')
          .in('event_id', chunk)
          .gte('created_at', fromIso)
          .lt('created_at', nowIso)
          .order('id', { ascending: true })
          .range(a, b),
    )
    for (const o of orders) {
      if (!SOLD.has(o.status)) continue
      add(o.event_id, 'conversion', 1)
      if (o.platform_fee_retained_cents !== null && o.stripe_processing_estimate_cents !== null) {
        add(o.event_id, 'health', Math.max(0, o.platform_fee_retained_cents - o.stripe_processing_estimate_cents))
      }
    }

    const links = await readEveryRow<{ id: string; event_id: string }>('their tracked links', (a, b) =>
      admin.from('share_links').select('id, event_id').in('event_id', chunk).order('id', { ascending: true }).range(a, b),
    )
    const eventOfLink = new Map(links.map((l) => [l.id, l.event_id]))
    for (const linkChunk of chunkInFilterValues(links.map((l) => l.id))) {
      const presses = await readEveryRow<{ link_id: string }>('their presses out', (a, b) =>
        admin
          .from('share_link_events')
          .select('id, link_id')
          .in('link_id', linkChunk)
          .eq('kind', 'outbound')
          .gte('occurred_at', fromIso)
          .lt('occurred_at', nowIso)
          .order('id', { ascending: true })
          .range(a, b),
      )
      for (const p of presses) add(eventOfLink.get(p.link_id), 'conversion', 1)
    }
  }

  const scoredEvents: ScoredEvent[] = events.map((e) => ({ id: e.id, city: e.city_primary, category: e.category_id, publishedAt: e.published_at }))
  const byId = new Map(events.map((e) => [e.id, e]))
  return scoreEvents(scoredEvents, raws, now).map((s) => {
    const e = byId.get(s.id)
    const base = { id: s.id, title: e?.title ?? '', slug: e?.slug ?? '', city: e?.city_primary ?? null, category: e?.category_id ?? null }
    return s.state === 'scored' ? { ...base, state: 'scored', score: s.score, parts: s.parts, raw: s.raw } : { ...base, state: 'needs_two_weeks' }
  })
}

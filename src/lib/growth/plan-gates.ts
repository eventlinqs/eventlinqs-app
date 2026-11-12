import 'server-only'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { readSupplyScorecard } from './supply-scorecard'
import { melbourneDay, PLAN_ZONE, planGates, recurringOrganisations, type GateCounts, type GateStanding } from './plan-gates-math'

/**
 * Reads the counts the master plan's gates are judged by (./plan-gates-math.ts names each rule), from production's own
 * tables, read only, through the service client the Command Centre already uses. A failed read throws; the caller
 * says the gates could not be read rather than showing a zero.
 */

/** The instant today began in Melbourne, as an ISO string. */
export function melbourneMidnight(now: Date): string {
  const day = melbourneDay(now)
  const name = new Intl.DateTimeFormat('en-AU', { timeZone: PLAN_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+10:00'
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/)
  const offsetMin = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 600
  return new Date(Date.parse(`${day}T00:00:00Z`) - offsetMin * 60000).toISOString()
}

export async function readPlanGates(now: Date = new Date()): Promise<GateStanding[]> {
  const admin = createAdminClient()
  const [nights, paid, supply, sentToday] = await Promise.all([
    readEveryRow<{ id: string; organisation_id: string | null; city_primary: string | null }>('the nights ahead that could sell', (f, t) =>
      admin.from('events').select('id, organisation_id, city_primary').match(PUBLIC_EVENT_MATCH).is('external_ticket_url', null)
        .or(listingWindowOrPredicate(now)).order('id', { ascending: true }).range(f, t),
    ),
    readEveryRow<{ event_id: string; confirmed_at: string | null }>('the paid orders', (f, t) =>
      admin.from('orders').select('event_id, confirmed_at').in('status', ['confirmed', 'partially_refunded']).gt('total_cents', 0)
        .order('event_id', { ascending: true }).range(f, t),
    ),
    readSupplyScorecard(now),
    admin.from('outreach_touches').select('id', { count: 'exact', head: true }).not('sent_at', 'is', null).gte('sent_at', melbourneMidnight(now)),
  ])
  if (sentToday.error) throw new Error(`the outreach sent today could not be read: ${sentToday.error.message}`)

  // Selling: a night ahead with no outside link and an active, visible tier above $0.
  const ids = nights.map((n) => n.id)
  const selling = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const tiers = await readEveryRow<{ event_id: string }>('the ticket tiers', (f, t) =>
      admin.from('ticket_tiers').select('id, event_id').in('event_id', ids.slice(i, i + 200)).eq('is_active', true).eq('is_visible', true).gt('price', 0)
        .order('id', { ascending: true }).range(f, t),
    )
    for (const t of tiers) selling.add(t.event_id)
  }

  // Recurring: the organisations behind paid orders, in two or more months.
  const orderEvents = [...new Set(paid.map((o) => o.event_id))]
  const orgOf = new Map<string, string | null>()
  for (let i = 0; i < orderEvents.length; i += 200) {
    const rows = await admin.from('events').select('id, organisation_id').in('id', orderEvents.slice(i, i + 200)).limit(200)
    if (rows.error) throw new Error(`the paid orders' events could not be read: ${rows.error.message}`)
    for (const r of rows.data ?? []) orgOf.set(r.id as string, (r.organisation_id as string | null) ?? null)
  }
  const recurring = recurringOrganisations(paid.map((o) => ({ organisationId: orgOf.get(o.event_id) ?? null, confirmedAt: o.confirmed_at })))

  const sellingInMelbourne = new Set(
    nights.filter((n) => selling.has(n.id) && (n.city_primary ?? '').trim().toLowerCase() === 'melbourne' && n.organisation_id).map((n) => n.organisation_id as string),
  )
  const counts: GateCounts = {
    selling: selling.size,
    recurring: recurring.size,
    checked: supply.cities.reduce((sum, c) => sum + c.verifiedUpcoming, 0),
    melbourne_paid: [...recurring].filter((id) => sellingInMelbourne.has(id)).length,
    outreach_today: sentToday.count ?? 0,
  }
  return planGates(counts, now)
}

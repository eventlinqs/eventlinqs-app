import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { dollars } from '@/lib/admin/morning-report-math'
import { SOLD_STATUSES } from '@/lib/broadcast/sales-attribution'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { PILOT_MOST } from './pilot'

/**
 * THE SOCIAL PILOT'S EIGHT MEASURES (EVENTLINQS-SOCIAL-ORGANISER-ENGINE-LOCKED-26NOV.md version 2, section 5; the PM's car
 * K lean, item K4), as one block of the 08:00 scoreboard and as the pilot section of /admin/acquisition. Every figure is
 * read from production for the pilot's own organisers, those with a contact the PM qualified (migration 20261126200002),
 * and each organiser counts only what happened from the day it was qualified: "Sending 100 messages is not a win if none
 * produces a paying organiser."
 */

type Admin = SupabaseClient<Database>

export type PilotContact = {
  readonly id: string
  readonly organiserId: string
  readonly organiserName: string
  readonly channel: string
  readonly address: string
  readonly personName: string | null
  readonly basis: string
  readonly qualifiedAt: string
  readonly sent: number
  readonly lastSentAt: string | null
  readonly positive: boolean
}

export type PilotMeasures = {
  readonly qualified: number
  readonly sent: number
  readonly positive: number
  readonly registrations: number
  readonly published: number
  readonly native: number
  readonly tickets: number
  readonly netCents: number
  readonly spendCents: number
  readonly active: number
}

const POSITIVE = ['yes', 'interested']

/** The block as the 08:00 report says it. Pure. */
export function pilotLine(m: PilotMeasures): string {
  if (m.qualified === 0) return `Social pilot: no organiser qualified yet (at most ${PILOT_MOST}, each with its business enquiry basis recorded); nothing sent.`
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const cost = m.active === 0 ? `no active organiser yet, ${dollars(m.spendCents)} spent` : `${dollars(Math.round(m.spendCents / m.active))} per active organiser`
  return [
    `Social pilot: ${m.qualified} of ${PILOT_MOST} organisers qualified`,
    n(m.sent, 'permitted message sent', 'permitted messages sent'),
    n(m.positive, 'positive response', 'positive responses'),
    n(m.registrations, 'registration', 'registrations'),
    n(m.published, 'event published', 'events published'),
    n(m.native, 'native ticketing event', 'native ticketing events'),
    `${n(m.tickets, 'ticket', 'tickets')}, ${dollars(m.netCents)} net platform revenue`,
    `cost: ${cost}.`,
  ].join('; ')
}

const need = <T>(r: { data: T[] | null; error: { message: string } | null }, what: string): T[] => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`)
  return r.data ?? []
}

/** Every pilot contact with its messages and whether it answered yes. A failed read throws. */
export async function readPilotContacts(db: Admin): Promise<PilotContact[]> {
  const qualified = need(
    await db.from('organiser_contacts').select('id, organiser_id, channel, address, person_name, pilot_basis, pilot_qualified_at').not('pilot_qualified_at', 'is', null).order('pilot_qualified_at').limit(PILOT_MOST + 5),
    'the pilot contacts',
  )
  // The platform's own listings organisation and the test organisers are never pilot organisers (platform-organiser.ts).
  const platform = await readPlatformOrganiserIds(db)
  const contacts = qualified.filter((c) => !platform.has(c.organiser_id))
  if (contacts.length === 0) return []
  const ids = contacts.map((c) => c.id)
  const organisers = need(await db.from('organisers').select('id, name').in('id', [...new Set(contacts.map((c) => c.organiser_id))]), 'their organisers')
  const touches = need(await db.from('outreach_touches').select('contact_id, sent_at').in('contact_id', ids).eq('purpose', 'cadence').eq('state', 'sent'), 'their messages')
  const replies = need(await db.from('outreach_replies').select('contact_id, outcome').in('contact_id', ids), 'their replies')
  const nameOf = new Map(organisers.map((o) => [o.id, o.name]))
  return contacts.map((c) => {
    const mine = touches.filter((t) => t.contact_id === c.id).map((t) => t.sent_at as string).sort()
    return {
      id: c.id,
      organiserId: c.organiser_id,
      organiserName: nameOf.get(c.organiser_id) ?? 'An organiser',
      channel: c.channel,
      address: c.address,
      personName: c.person_name,
      basis: c.pilot_basis ?? '',
      qualifiedAt: c.pilot_qualified_at as string,
      sent: mine.length,
      lastSentAt: mine.at(-1) ?? null,
      positive: replies.some((r) => r.contact_id === c.id && POSITIVE.includes(r.outcome)),
    }
  })
}

/** The eight measures, each organiser from the day it was qualified. A failed read throws. */
export async function readPilotMeasures(db: Admin, known?: readonly PilotContact[]): Promise<PilotMeasures> {
  const contacts = known ?? (await readPilotContacts(db))
  const none: PilotMeasures = { qualified: 0, sent: 0, positive: 0, registrations: 0, published: 0, native: 0, tickets: 0, netCents: 0, spendCents: 0, active: 0 }
  if (contacts.length === 0) return none
  const since = new Map<string, string>()
  for (const c of contacts) if (!since.has(c.organiserId) || c.qualifiedAt < since.get(c.organiserId)!) since.set(c.organiserId, c.qualifiedAt)
  const accounts = need(await db.from('organisers').select('id, organisation_id').in('id', [...since.keys()]).not('organisation_id', 'is', null), 'their accounts')
  const startOf = new Map<string, string>()
  for (const a of accounts) if (a.organisation_id) startOf.set(a.organisation_id, since.get(a.id)!)
  const orgIds = [...startOf.keys()]
  const after = (orgId: string, at: string | null) => at !== null && at >= startOf.get(orgId)!
  let registrations = 0
  let published = 0
  let native = 0
  let tickets = 0
  let netCents = 0
  const active = new Set<string>()
  if (orgIds.length) {
    const orgs = need(await db.from('organisations').select('id, created_at').in('id', orgIds), 'their EventLinqs accounts')
    registrations = orgs.filter((o) => after(o.id, o.created_at)).length
    const events = need(await db.from('events').select('id, organisation_id, published_at').in('organisation_id', orgIds).eq('status', 'published').eq('is_test', false), 'their events').filter((e) => after(e.organisation_id, e.published_at))
    published = events.length
    const tiers = events.length ? need(await db.from('ticket_tiers').select('event_id').in('event_id', events.map((e) => e.id)), 'their ticket types') : []
    const ticketed = new Set(tiers.map((t) => t.event_id))
    native = events.filter((e) => ticketed.has(e.id)).length
    for (const e of events) if (ticketed.has(e.id)) active.add(e.organisation_id)
    const sales = need(await db.from('ledger_entries').select('organisation_id, quantity, occurred_at').eq('kind', 'sale').in('organisation_id', orgIds), 'their tickets sold')
    tickets = sales.filter((s) => after(s.organisation_id, s.occurred_at)).reduce((n, s) => n + (s.quantity ?? 0), 0)
    const orders = need(
      await db.from('orders').select('organisation_id, status, platform_fee_cents, platform_fee_retained_cents, created_at').in('organisation_id', orgIds).in('status', [...SOLD_STATUSES]).eq('is_test', false),
      'their orders',
    )
    netCents = orders
      .filter((o) => after(o.organisation_id, o.created_at))
      .reduce((n, o) => n + Number(o.platform_fee_retained_cents ?? (o.status === 'refunded' ? 0 : o.platform_fee_cents)), 0)
  }
  return {
    qualified: since.size,
    sent: contacts.reduce((n, c) => n + c.sent, 0),
    positive: contacts.filter((c) => c.positive).length,
    registrations,
    published,
    native,
    tickets,
    netCents,
    // The pilot is manual and unpaid by Lawal's decisions of 23:01 (no assistant, no paid chat advertising): nothing to add.
    spendCents: 0,
    active: active.size,
  }
}

export async function readPilotLine(db: Admin): Promise<string> {
  return pilotLine(await readPilotMeasures(db))
}

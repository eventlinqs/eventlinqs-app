import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isAcquisitionState } from '@/lib/outreach/acquisition-states'
import { recordOf, type OrganiserRecord, type Sources } from './timeline-math'

/**
 * ONE ORGANISER'S SOURCES, READ (the Growth OS directive, Release 1; the rules are ./timeline-math.ts, pure). Every source
 * the record gathers, one read each, never a write. A failed read throws with the source's name: the page then says which
 * part of the record could not be read rather than showing a record with a hole in it (Lawal's directive section 5: "The
 * system must never silently lose failed tasks").
 *
 * THE ORGANISER'S NIGHTS are those at a venue linked to them (organiser_venues) or under their own account
 * (organisers.organisation_id): the same two roads the acquisition state machine reads (migration 20261030034001).
 * TICKETING is read the way the scorecard counts it (migration 20261101044501): a public night ahead with no outside
 * ticket link and an active, visible ticket tier above $0; a paid order is confirmed or partially refunded, above $0.
 */
type Admin = SupabaseClient

export class RecordReadError extends Error {
  constructor(readonly source: string, message: string) {
    super(`the ${source} could not be read: ${message}`)
  }
}

async function rows<T>(source: string, q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q
  if (error) throw new RecordReadError(source, error.message)
  return (data ?? []) as T[]
}

const melbourneMonth = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit' }).format(new Date(iso))

export async function readOrganiserRecord(db: Admin, organiserId: string, now: Date = new Date()): Promise<{ sources: Sources; record: OrganiserRecord } | null> {
  const { data: org, error } = await db
    .from('organisers')
    .select('id, name, created_at, acquisition_state, found_on, organisation_id')
    .eq('id', organiserId)
    .maybeSingle()
  if (error) throw new RecordReadError('organiser', error.message)
  if (!org) return null
  const rawState = String(org.acquisition_state)
  const state = isAcquisitionState(rawState) ? rawState : 'discovered'
  const organisationId = (org.organisation_id as string | null) ?? null

  const [contacts, transitions, links] = await Promise.all([
    rows<Sources['contacts'][number]>('contacts', db.from('organiser_contacts').select('id, channel, address, role, basis, basis_recorded_at, created_at').eq('organiser_id', organiserId)),
    rows<Sources['transitions'][number]>('stage history', db.from('organiser_acquisition_transitions').select('from_state, to_state, proved_by, at').eq('organiser_id', organiserId).order('at', { ascending: false }).limit(200)),
    rows<{ venue_id: string; linked_at: string }>('venue links', db.from('organiser_venues').select('venue_id, linked_at').eq('organiser_id', organiserId)),
  ])
  const contactIds = contacts.map((c) => c.id)
  const emails = contacts.filter((c) => c.channel === 'email').map((c) => c.address)
  const venueIds = links.map((l) => l.venue_id)

  const nightFilter = [venueIds.length ? `venue_id.in.(${venueIds.join(',')})` : null, organisationId ? `organisation_id.eq.${organisationId}` : null].filter(Boolean).join(',')
  const [touches, replies, unsubscribes, venueNames, nights] = await Promise.all([
    contactIds.length ? rows<Sources['touches'][number]>('messages', db.from('outreach_touches').select('id, contact_id, step, state, subject, drafted_at, sent_at, void_reason, held_because, failed_reason').in('contact_id', contactIds)) : Promise.resolve([]),
    contactIds.length ? rows<Sources['replies'][number]>('replies', db.from('outreach_replies').select('id, contact_id, received_at, outcome, needs_lawal').in('contact_id', contactIds)) : Promise.resolve([]),
    emails.length ? rows<Sources['unsubscribes'][number]>('unsubscribes', db.from('outreach_unsubscribes').select('email, created_at, reason').in('email', emails)) : Promise.resolve([]),
    venueIds.length ? rows<{ id: string; name: string }>('venues', db.from('venues').select('id, name').in('id', venueIds)) : Promise.resolve([]),
    nightFilter ? rows<Sources['nights'][number] & { external_ticket_url: string | null; visibility: string | null }>('nights', db.from('events').select('id, title, slug, start_date, status, created_at, external_ticket_url, visibility').or(nightFilter).order('start_date', { ascending: false }).limit(200)) : Promise.resolve([]),
  ])
  const nameOf = new Map(venueNames.map((v) => [v.id, v.name]))
  const nightIds = nights.map((n) => n.id)
  const claimFilter = [venueIds.length ? `venue_id.in.(${venueIds.join(',')})` : null, nightIds.length ? `event_id.in.(${nightIds.join(',')})` : null].filter(Boolean).join(',')

  const [claims, submissions, permissions, photos, tiers, orders] = await Promise.all([
    claimFilter ? rows<Sources['claims'][number]>('claims', db.from('listing_claims').select('id, status, created_at, verified_at, event_id, venue_id').or(claimFilter)) : Promise.resolve([]),
    nightIds.length ? rows<Sources['submissions'][number]>('submissions', db.from('listing_submissions').select('id, title, status, created_at, published_event_id, held_because').in('published_event_id', nightIds)) : Promise.resolve([]),
    organisationId || nightIds.length
      ? rows<Sources['permissions'][number]>('permissions', db.from('organiser_permissions').select('id, scope, granted_at, withdrawn_at').or([organisationId ? `organisation_id.eq.${organisationId}` : null, nightIds.length ? `event_id.in.(${nightIds.join(',')})` : null].filter(Boolean).join(',')))
      : Promise.resolve([]),
    nightIds.length ? rows<Sources['photos'][number]>('photos', db.from('photo_assignments').select('event_id, assigned_at, rights_holder, retired_at').in('event_id', nightIds)) : Promise.resolve([]),
    nightIds.length ? rows<{ event_id: string; is_active: boolean; is_visible: boolean; price: number }>('ticket tiers', db.from('ticket_tiers').select('event_id, is_active, is_visible, price').in('event_id', nightIds)) : Promise.resolve([]),
    nightIds.length
      ? rows<Sources['paidOrders'][number]>('orders', db.from('orders').select('order_number, total_cents, confirmed_at, event_id').in('event_id', nightIds).in('status', ['confirmed', 'partially_refunded']).gt('total_cents', 0))
      : Promise.resolve([]),
  ])

  const sellingNight = new Set(tiers.filter((t) => t.is_active && t.is_visible && Number(t.price) > 0).map((t) => t.event_id))
  const ticketingActivated = nights.some(
    (n) => n.status === 'published' && (n.visibility ?? 'public') === 'public' && !n.external_ticket_url && new Date(n.start_date) >= now && sellingNight.has(n.id),
  )
  const paidMonths = new Set(orders.map((o) => o.confirmed_at).filter((d): d is string => Boolean(d)).map(melbourneMonth)).size

  const sources: Sources = {
    organiser: { id: org.id as string, name: org.name as string, created_at: org.created_at as string, acquisition_state: state, found_on: (org.found_on as string | null) ?? null },
    contacts,
    transitions,
    touches,
    replies,
    unsubscribes,
    venues: links.map((l) => ({ venue_id: l.venue_id, name: nameOf.get(l.venue_id) ?? 'a venue', linked_at: l.linked_at })),
    nights: nights.map(({ id, title, slug, start_date, status, created_at }) => ({ id, title, slug, start_date, status, created_at })),
    claims,
    submissions,
    permissions,
    photos,
    ticketing: { ticketingActivated, paidOrders: orders.length, paidMonths },
    paidOrders: orders,
  }
  return { sources, record: recordOf(sources) }
}

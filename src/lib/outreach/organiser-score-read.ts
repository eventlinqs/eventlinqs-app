import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { applyPublicEventVisibility } from '@/lib/events/public-visibility'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { broadcastCta } from '@/lib/broadcast/price-line'
import { statedCityOf } from './cohort-pick'
import { HORIZON_DAYS, lineOf, rankOrganisers, scoreOrganisers, type Night, type OrganiserFacts, type OrganiserScore } from './organiser-score'

/**
 * THE ORGANISER SCORE, THE FACTS (window 6, 30 October 2026; the arithmetic and its source are
 * src/lib/outreach/organiser-score.ts). One line per organiser in the CRM (public.organisers), read from stored rows:
 *
 *   nights        their published, public nights starting in the next 90 days: at a venue linked to them
 *                 (organiser_venues), or, once they have claimed, under their own account; each night's city is its
 *                 venue's, its call to action the one function's (broadcastCta, so the score and every surface agree).
 *   writableEmail an email contact whose basis is not 'none' and whom outreach_contact_refusal does not refuse.
 *   positiveSign  a 'yes' or 'interested' reply, a claim (organisation_id set), or a listing submission from one of
 *                 their contact addresses.
 *   stopped       a 'no' or 'stop' reply from any of their contacts.
 *
 * Service role: callers are admin pages and jobs.
 */

type Admin = SupabaseClient<Database>
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * city: for the cohort's city shares (src/lib/outreach/cohort-pick.ts). The city most of their linked venues stand in
 * (a tie by slug); else, for an organiser with no venue linked, the city their source file stated, as the cohort import
 * wrote it into notes ('City: Geelong.', scripts/ops/outreach-cohort.mjs). On production on 30 October 118 of the 151
 * organisers had no venue linked, so without the second source the shares could place only 33. citySource says which.
 * writableEmail as the score read it.
 */
export type ScoredOrganiser = { id: string; name: string; city: string | null; citySource: 'venue' | 'source_file' | null; writableEmail: boolean } & OrganiserScore

type NightRow = {
  id: string
  venue_id: string | null
  organisation_id: string
  description: string | null
  summary: string | null
  cover_image_url: string | null
  entry_mode: string | null
  is_free: boolean | null
  external_ticket_url: string | null
  ticket_tiers: { price: number; is_active: boolean | null }[] | null
}
const NIGHT_COLUMNS = 'id, venue_id, organisation_id, description, summary, cover_image_url, entry_mode, is_free, external_ticket_url, ticket_tiers(price, is_active)'

export async function readOrganiserScores(db: Admin, now: Date = new Date()): Promise<ScoredOrganiser[]> {
  const fromIso = now.toISOString()
  const untilIso = new Date(now.getTime() + HORIZON_DAYS * DAY_MS).toISOString()

  const organisers = await readEveryRow<{ id: string; name: string; organisation_id: string | null; notes: string | null }>('the organisers the score reads', (a, b) =>
    db.from('organisers').select('id, name, organisation_id, notes').order('id', { ascending: true }).range(a, b),
  )
  const links = await readEveryRow<{ venue_id: string; organiser_id: string }>('their venues', (a, b) =>
    db.from('organiser_venues').select('venue_id, organiser_id').order('venue_id', { ascending: true }).range(a, b),
  )

  const venues = new Map<string, { city_slug: string | null; address: string | null }>()
  for (const chunk of chunkInFilterValues(links.map((l) => l.venue_id))) {
    const rows = await readEveryRow<{ id: string; city_slug: string | null; address: string | null }>('the venues of those links', (a, b) =>
      db.from('venues').select('id, city_slug, address').in('id', chunk).is('removed_at', null).order('id', { ascending: true }).range(a, b),
    )
    for (const v of rows) venues.set(v.id, { city_slug: v.city_slug, address: v.address })
  }

  const nightsById = new Map<string, NightRow>()
  const readNights = async (column: 'venue_id' | 'organisation_id', values: string[]) => {
    for (const chunk of chunkInFilterValues(values)) {
      const rows = await readEveryRow<NightRow>(`the nights ahead by ${column}`, (a, b) =>
        applyPublicEventVisibility(
          db.from('events').select(NIGHT_COLUMNS).in(column, chunk).gte('start_date', fromIso).lte('start_date', untilIso).order('id', { ascending: true }),
          // The score lists an organiser's nights, it does not promote a sale, so a night sold on an outside site
          // counts (public-visibility.ts clause 4); without this every outside-ticket night was dropped and value
          // could only ever count EventLinqs tickets and registration.
          { now, includeExternal: true },
        ).range(a, b),
      )
      for (const r of rows) nightsById.set(r.id, r)
    }
  }
  await readNights('venue_id', [...venues.keys()])
  const claimed = organisers.filter((o) => o.organisation_id !== null)
  await readNights('organisation_id', claimed.map((o) => o.organisation_id as string))

  const kindOf = new Map<string, string>()
  for (const chunk of chunkInFilterValues([...nightsById.keys()])) {
    const rows = await readEveryRow<{ id: string; event_id: string; kind: string }>('their primary booking links', (a, b) =>
      db.from('event_booking_links').select('id, event_id, kind').in('event_id', chunk).eq('is_primary', true).order('id', { ascending: true }).range(a, b),
    )
    for (const r of rows) kindOf.set(r.event_id, r.kind)
  }

  const contacts = await readEveryRow<{ id: string; organiser_id: string; channel: string; address: string; basis: string }>('their contacts', (a, b) =>
    db.from('organiser_contacts').select('id, organiser_id, channel, address, basis').order('id', { ascending: true }).range(a, b),
  )
  const replies = await readEveryRow<{ id: string; contact_id: string; outcome: string }>('their replies', (a, b) =>
    db.from('outreach_replies').select('id, contact_id, outcome').in('outcome', ['yes', 'interested', 'no', 'stop']).order('id', { ascending: true }).range(a, b),
  )
  const submitted = await readEveryRow<{ id: string; email: string }>('the listing submissions', (a, b) =>
    db.from('listing_submissions').select('id, email').order('id', { ascending: true }).range(a, b),
  )
  const submittedBy = new Set(submitted.map((s) => s.email.trim().toLowerCase()))

  const organiserOfContact = new Map(contacts.map((c) => [c.id, c.organiser_id]))
  const positive = new Set<string>()
  const stopped = new Set<string>()
  for (const r of replies) {
    const o = organiserOfContact.get(r.contact_id)
    if (!o) continue
    if (r.outcome === 'no' || r.outcome === 'stop') stopped.add(o)
    else positive.add(o)
  }
  for (const c of contacts) if (c.channel === 'email' && submittedBy.has(c.address.trim().toLowerCase())) positive.add(c.organiser_id)

  const writable = new Set<string>()
  for (const c of contacts) {
    if (c.channel !== 'email' || c.basis === 'none' || stopped.has(c.organiser_id) || writable.has(c.organiser_id)) continue
    const refusal = await db.rpc('outreach_contact_refusal', { p_contact: c.id })
    if (refusal.error) throw new Error(`outreach_contact_refusal: ${refusal.error.message}`)
    if (refusal.data === null) writable.add(c.organiser_id)
  }

  const venuesOf = new Map<string, string[]>()
  for (const l of links) venuesOf.set(l.organiser_id, [...(venuesOf.get(l.organiser_id) ?? []), l.venue_id])

  const facts: OrganiserFacts[] = organisers.map((o) => {
    const own = new Set(venuesOf.get(o.id) ?? [])
    const mine = [...nightsById.values()].filter((n) => (n.venue_id !== null && own.has(n.venue_id)) || (o.organisation_id !== null && n.organisation_id === o.organisation_id))
    const nights: Night[] = mine.map((n) => {
      const venue = n.venue_id ? venues.get(n.venue_id) : undefined
      return {
        citySlug: venue?.city_slug ?? null,
        cta: broadcastCta({ ticket_tiers: n.ticket_tiers, external_ticket_url: n.external_ticket_url, is_free: n.is_free, entry_mode: n.entry_mode, external_kind: kindOf.get(n.id) ?? null }).state,
        hasDescription: lineOf(n),
        hasImage: typeof n.cover_image_url === 'string' && n.cover_image_url.trim() !== '',
        hasVenueAddress: typeof venue?.address === 'string' && venue.address.trim() !== '',
      }
    })
    return { id: o.id, nights, writableEmail: writable.has(o.id), positiveSign: positive.has(o.id) || o.organisation_id !== null, stopped: stopped.has(o.id) }
  })

  const notesOf = new Map(organisers.map((o) => [o.id, o.notes]))
  const cityOf = (organiserId: string): Pick<ScoredOrganiser, 'city' | 'citySource'> => {
    const count = new Map<string, number>()
    for (const v of venuesOf.get(organiserId) ?? []) {
      const slug = venues.get(v)?.city_slug
      if (slug) count.set(slug, (count.get(slug) ?? 0) + 1)
    }
    const byVenue = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null
    if (byVenue) return { city: byVenue, citySource: 'venue' }
    const stated = statedCityOf(notesOf.get(organiserId) ?? null)
    return stated ? { city: stated, citySource: 'source_file' } : { city: null, citySource: null }
  }
  const nameOf = new Map(organisers.map((o) => [o.id, o.name]))
  const scored = scoreOrganisers(facts)
  const ranked = rankOrganisers(scored)
  const rest = scored.filter((s) => s.state !== 'scored')
  return [...ranked, ...rest].map((s) => ({ ...s, name: nameOf.get(s.id) ?? '', ...cityOf(s.id), writableEmail: writable.has(s.id) }))
}

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { pageViewKeyParts } from '@/lib/growth/page-view-key'
import { readNightViewers } from '@/lib/growth/organiser-report'
import { photoPath } from './photo-link'
import { readTheirNights } from './their-nights'
import { addressFitsName, isSegmentANight, melbourneDayOf, type SegmentAFacts } from './segment-a-letter'
import type { VoiceConsent } from './voice-gate'

/**
 * WHAT A SEGMENT A LETTER STATES, READ WHEN IT IS DRAFTED (the PM's 02:00 of 18 November 2026, item 2: "the counts read by
 * the FIXED key reader at send time"; the play drafts a letter in the hour it is queued to go, so the numbers are that
 * hour's). Read only. Every fact comes from production's own rows:
 *   their nights           ./their-nights.ts, the one reader of an organiser's own public nights;
 *   the night it names     the first of those starting 3 or more days after the day the letter lands (./segment-a-letter.ts);
 *   booking pages          an external ticket link or a booking link on each listed night;
 *   a photograph           the night's own cover;
 *   openers                distinct people who opened any of their events' pages, the page view key read one way
 *                          (src/lib/growth/page-view-key.ts), over every event at their venues, under their account, or
 *                          listed now;
 *   the night's own openers the night report's own count (src/lib/growth/organiser-report.ts readNightViewers);
 *   the consent basis      the contact's own row (the standard's Part 2 rule 5).
 * A fact that cannot be read is a reason, never a guess: the letter is not drafted and the run says why.
 */

type Admin = SupabaseClient<Database>

export type SegmentARead =
  | { readonly state: 'read'; readonly facts: SegmentAFacts; readonly consent: VoiceConsent; readonly eventDate: string; readonly eventId: string; readonly organiserId: string }
  | { readonly state: 'not read'; readonly why: string }

const chunks = <T,>(list: readonly T[], size = 200): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

/** Distinct people who opened any of these events' pages, read through the one page view key reader. */
export async function readOpeners(db: Admin, eventIds: readonly string[]): Promise<number> {
  const visitors = new Set<string>()
  for (const ids of chunks(eventIds)) {
    const slots = await db.from('ledger_slots').select('id').in('source_ref', ids)
    if (slots.error) throw new Error(`their ledger slots could not be read: ${slots.error.message}`)
    for (const slotIds of chunks((slots.data ?? []).map((s) => s.id as string))) {
      for (let from = 0; ; from += 1000) {
        const rows = await db
          .from('ledger_entries')
          .select('occurrence_key')
          .in('slot_id', slotIds)
          .eq('kind', 'demand')
          .eq('demand_action', 'page_view')
          .order('id', { ascending: true })
          .range(from, from + 999)
        if (rows.error) throw new Error(`their page views could not be read: ${rows.error.message}`)
        for (const r of rows.data ?? []) {
          const k = pageViewKeyParts(r.occurrence_key as string)
          if (k) visitors.add(k.visitor)
        }
        if ((rows.data ?? []).length < 1000) break
      }
    }
  }
  return visitors.size
}

export async function readSegmentAFacts(db: Admin, input: { readonly contactId: string; readonly landsOn: string; readonly now: Date; readonly origin: string }): Promise<SegmentARead> {
  const contact = await db
    .from('organiser_contacts')
    .select('organiser_id, address, person_name, unsubscribe_token, basis, published_on_url, no_marketing_statement_checked')
    .eq('id', input.contactId)
    .single()
  if (contact.error) return { state: 'not read', why: `the contact could not be read: ${contact.error.message}` }
  const org = await db.from('organisers').select('id, name, organisation_id, website_url').eq('id', contact.data.organiser_id as string).single()
  if (org.error) return { state: 'not read', why: `the organiser could not be read: ${org.error.message}` }
  // The greeting names the organisation that owns the address (the PM's 03:10, class 10): otherwise no letter, with why.
  if (!addressFitsName(contact.data.address as string, org.data.name as string)) {
    return { state: 'not read', why: `the greeting would name ${org.data.name as string}, which ${contact.data.address as string} does not belong to; the contact's own organisation is read first` }
  }

  const nights = await readTheirNights(db, { id: org.data.id as string, organisation_id: org.data.organisation_id as string | null, website_url: org.data.website_url as string | null }, input.now, 500)
  if (nights.length === 0) return { state: 'not read', why: 'no public night of theirs is listed' }
  const ids = nights.map((n) => n.eventId)
  const rows: { id: string; category_id: string | null; cover_image_url: string | null; external_ticket_url: string | null }[] = []
  const booked = new Set<string>()
  for (const part of chunks(ids)) {
    const ev = await db.from('events').select('id, category_id, cover_image_url, external_ticket_url').in('id', part)
    if (ev.error) return { state: 'not read', why: `their nights could not be read: ${ev.error.message}` }
    rows.push(...((ev.data ?? []) as typeof rows))
    const links = await db.from('event_booking_links').select('event_id').in('event_id', part)
    if (links.error) return { state: 'not read', why: `their booking links could not be read: ${links.error.message}` }
    for (const l of links.data ?? []) booked.add(l.event_id as string)
  }
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const r of rows) if ((r.external_ticket_url ?? '').trim()) booked.add(r.id)

  const next = nights.find((n) => isSegmentANight(n.startDate, input.landsOn, n.timezone))
  if (!next) return { state: 'not read', why: `no night of theirs starts 3 or more days after ${input.landsOn}, so there is nothing to name (the standard's timing rule)` }
  const row = byId.get(next.eventId)
  let categorySlug: string | null = null
  if (row?.category_id) {
    const cat = await db.from('event_categories').select('slug').eq('id', row.category_id).maybeSingle()
    if (cat.error) return { state: 'not read', why: `its category could not be read: ${cat.error.message}` }
    categorySlug = (cat.data?.slug as string | undefined) ?? null
  }

  // Every event of theirs ever listed at their venues or under their account, and every night listed now.
  const everIds = new Set(ids)
  const venues = await db.from('organiser_venues').select('venue_id').eq('organiser_id', org.data.id as string)
  if (venues.error) return { state: 'not read', why: `their venues could not be read: ${venues.error.message}` }
  for (const part of chunks((venues.data ?? []).map((v) => v.venue_id as string))) {
    const ev = await db.from('events').select('id').in('venue_id', part).limit(5000)
    if (ev.error) return { state: 'not read', why: `their events could not be read: ${ev.error.message}` }
    for (const e of ev.data ?? []) everIds.add(e.id as string)
  }
  if (org.data.organisation_id) {
    const ev = await db.from('events').select('id').eq('organisation_id', org.data.organisation_id as string).limit(5000)
    if (ev.error) return { state: 'not read', why: `their account's events could not be read: ${ev.error.message}` }
    for (const e of ev.data ?? []) everIds.add(e.id as string)
  }

  let openers: number
  let nightOpeners: number
  try {
    openers = await readOpeners(db, [...everIds])
    nightOpeners = await readNightViewers(next.eventId, db)
  } catch (e) {
    return { state: 'not read', why: (e as Error).message }
  }
  const token = contact.data.unsubscribe_token as string | null
  return {
    state: 'read',
    organiserId: org.data.id as string,
    eventId: next.eventId,
    eventDate: melbourneDayOf(next.startDate, next.timezone),
    consent: {
      basis: contact.data.basis as string,
      publishedOnUrl: (contact.data.published_on_url as string | null) ?? null,
      noMarketingStatementChecked: contact.data.no_marketing_statement_checked === true,
    },
    facts: {
      organiserName: org.data.name as string,
      personName: (contact.data.person_name as string | null) ?? null,
      night: {
        title: next.title,
        slug: next.slug,
        startDate: next.startDate,
        timezone: next.timezone,
        categorySlug,
        hasPhoto: Boolean((row?.cover_image_url ?? '').trim()),
        hasBooking: booked.has(next.eventId),
      },
      listedNow: nights.length,
      listedWithBooking: nights.filter((n) => booked.has(n.eventId)).length,
      openers,
      nightOpeners,
      photoLink: token ? `${input.origin.replace(/\/+$/, '')}${photoPath(input.contactId, token)}` : null,
      origin: input.origin,
    },
  }
}

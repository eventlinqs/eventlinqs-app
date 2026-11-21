import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { photoPath } from './photo-link'
import { readTheirNights } from './their-nights'
import { addressFitsName, melbourneDayOf } from './segment-a-letter'
import { LIFECYCLE_SUBTYPE, lifecycleChoice, type LifecycleFacts, type LifecycleKey, type LifecycleNightClock } from './lifecycle-letters'
import type { VoiceConsent } from './voice-gate'

/**
 * WHAT A LAW 49 LETTER NEEDS, READ WHEN IT IS DRAFTED (law 49; read only). For one organiser contact the play's cohort
 * reaches, from production's own rows:
 *   who to write to     the contact the organiser was already written at, if any (one conversation per organiser, the
 *                        sender's one-first-letter rule), else the contact the play reached;
 *   whether to write    a reply from them, or a letter of this kind already gone or going, means no letter;
 *   their nights        ./their-nights.ts, the one reader of an organiser's own public nights, soonest first;
 *   granted             a night whose cover is the organiser's own photograph with recorded rights needs no PERM;
 *   the clock           ./lifecycle-letters.ts lifecycleChoice: is the letter due today, and on which night;
 *   the night's words   its title, day, city and booking page; their secure photo link; the consent basis.
 * A fact that cannot be read is a reason, never a guess: the letter is not drafted and the run says why.
 */

type Admin = SupabaseClient<Database>

export type LifecycleRead =
  | {
      readonly state: 'read'
      /** The contact the letter goes to (it may be the organiser's thread contact, not the one the cohort reached). */
      readonly recipientId: string
      readonly organiserId: string
      readonly eventId: string
      readonly eventDate: string
      readonly facts: LifecycleFacts
      readonly consent: VoiceConsent
    }
  | { readonly state: 'not due' | 'not read'; readonly why: string }

const GRANTED = ['organiser_authorised', 'separately_licensed']
const GOING = ['queued', 'sending', 'sent']

export async function readLifecycleFacts(
  db: Admin,
  input: { readonly key: LifecycleKey; readonly playId: string; readonly contactId: string; readonly now: Date; readonly origin: string },
): Promise<LifecycleRead> {
  const reached = await db.from('organiser_contacts').select('organiser_id').eq('id', input.contactId).single()
  if (reached.error) return { state: 'not read', why: `the contact could not be read: ${reached.error.message}` }
  const organiserId = reached.data.organiser_id as string
  // The platform's own listings organisation and every test organiser are never written to (src/lib/growth/platform-organiser.ts).
  if ((await readPlatformOrganiserIds(db)).has(organiserId)) return { state: 'not read', why: "the platform's own listings organisation, or a test organiser" }

  const theirs = await db
    .from('organiser_contacts')
    .select('id, channel, address, person_name, unsubscribe_token, basis, published_on_url, no_marketing_statement_checked')
    .eq('organiser_id', organiserId)
  if (theirs.error) return { state: 'not read', why: `their contacts could not be read: ${theirs.error.message}` }
  const ids = (theirs.data ?? []).map((c) => c.id as string)
  const touches = await db.from('outreach_touches').select('contact_id, state, play_id, comms_subtype, sent_at').in('contact_id', ids).neq('state', 'void')
  if (touches.error) return { state: 'not read', why: `their messages could not be read: ${touches.error.message}` }
  const replies = await db.from('outreach_replies').select('contact_id').in('contact_id', ids).limit(1)
  if (replies.error) return { state: 'not read', why: `their replies could not be read: ${replies.error.message}` }
  const subtype = LIFECYCLE_SUBTYPE[input.key]
  const alreadyAsked = (touches.data ?? []).some((t) => t.comms_subtype === subtype && (GOING.includes(t.state as string) || t.play_id === input.playId))
  const replied = (replies.data ?? []).length > 0
  if (replied || alreadyAsked) {
    const c = lifecycleChoice(input.key, { replied, alreadyAsked, nights: [] }, input.now)
    return { state: 'not due', why: c.due ? 'unreachable' : c.why }
  }

  // One conversation per organiser: the contact they were already written at, when there is one, is the one written to.
  const sentTo = [...(touches.data ?? [])].filter((t) => t.state === 'sent').sort((a, b) => String(b.sent_at ?? '').localeCompare(String(a.sent_at ?? '')))[0]
  const recipient = (theirs.data ?? []).find((c) => c.id === (sentTo?.contact_id ?? input.contactId))
  if (!recipient) return { state: 'not read', why: 'the contact to write to could not be found among theirs' }
  if (recipient.channel !== 'email' || recipient.basis === 'none') {
    return { state: 'not read', why: `they were written at ${recipient.address as string}, which may no longer be written to by email; a new address is never started` }
  }

  const org = await db.from('organisers').select('id, name, organisation_id, website_url').eq('id', organiserId).single()
  if (org.error) return { state: 'not read', why: `the organiser could not be read: ${org.error.message}` }
  // The greeting names the organisation that owns the address (the PM's 03:10 of 18 November 2026, class 10).
  if (!addressFitsName(recipient.address as string, org.data.name as string)) {
    return { state: 'not read', why: `the greeting would name ${org.data.name as string}, which ${recipient.address as string} does not belong to` }
  }

  const nights = await readTheirNights(
    db,
    { id: org.data.id as string, organisation_id: org.data.organisation_id as string | null, website_url: org.data.website_url as string | null },
    input.now,
    20,
  )
  if (nights.length === 0) return { state: 'not due', why: 'no public night of theirs is listed ahead' }
  const nightIds = nights.map((n) => n.eventId)
  const rows = await db.from('events').select('id, end_date, city_primary, external_ticket_url, cover_image_url').in('id', nightIds)
  if (rows.error) return { state: 'not read', why: `their nights could not be read: ${rows.error.message}` }
  const rights = await db.from('event_image_rights').select('event_id, image_url, rights_state').in('event_id', nightIds).eq('image_role', 'cover')
  if (rights.error) return { state: 'not read', why: `their nights' photo rights could not be read: ${rights.error.message}` }
  const links = await db.from('event_booking_links').select('event_id, url').in('event_id', nightIds)
  if (links.error) return { state: 'not read', why: `their booking links could not be read: ${links.error.message}` }
  const byId = new Map((rows.data ?? []).map((r) => [r.id as string, r]))
  const clocks: LifecycleNightClock[] = nights.map((n) => {
    const row = byId.get(n.eventId)
    const cover = (row?.cover_image_url as string | null) ?? null
    const granted = cover !== null && (rights.data ?? []).some((r) => r.event_id === n.eventId && r.image_url === cover && GRANTED.includes(r.rights_state as string))
    return { eventId: n.eventId, startIso: n.startDate, endIso: (row?.end_date as string | null) ?? null, zone: n.timezone || 'Australia/Melbourne', granted }
  })
  const choice = lifecycleChoice(input.key, { replied, alreadyAsked, nights: clocks }, input.now)
  if (!choice.due) return { state: 'not due', why: choice.why }

  const night = nights.find((n) => n.eventId === choice.eventId)!
  const row = byId.get(choice.eventId)
  const bookingUrl = ((row?.external_ticket_url as string | null) ?? '').trim() || ((links.data ?? []).find((l) => l.event_id === choice.eventId)?.url as string | undefined) || null
  const token = recipient.unsubscribe_token as string | null
  return {
    state: 'read',
    recipientId: recipient.id as string,
    organiserId,
    eventId: choice.eventId,
    eventDate: melbourneDayOf(night.startDate, night.timezone),
    consent: {
      basis: recipient.basis as string,
      publishedOnUrl: (recipient.published_on_url as string | null) ?? null,
      noMarketingStatementChecked: recipient.no_marketing_statement_checked === true,
    },
    facts: {
      organiserName: org.data.name as string,
      personName: (recipient.person_name as string | null) ?? null,
      websiteUrl: (org.data.website_url as string | null) ?? null,
      night: {
        title: night.title,
        slug: night.slug,
        startDate: night.startDate,
        timezone: night.timezone,
        citySlug: (row?.city_primary as string | null) ?? null,
        bookingUrl,
      },
      photoLink: token ? `${input.origin.replace(/\/+$/, '')}${photoPath(recipient.id as string, token)}` : null,
      origin: input.origin,
    },
  }
}

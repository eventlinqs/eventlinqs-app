import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { draftAcqFollowUp } from './acq-follow-up'
import { mailboxFor } from './addresses'
import { draftFromTemplate } from './drafts'
import type { LetterEvent } from './event-validity'
import { LIFECYCLE_SUBTYPE, lifecycleFields, type LifecycleFacts, type LifecycleKey } from './lifecycle-letters'
import { draftPermFollowUp } from './perm-follow-up'
import { photoPath } from './photo-link'
import { greetingOf, melbourneDayOf } from './segment-a-letter'
import { inBusinessHours } from './sender'
import { touchVoiceMessage } from './touch-voice'
import { readVoicePolicy, voiceProblems, type VoiceConsent } from './voice-gate'

/**
 * A LAW 49 LETTER'S ONE FOLLOW UP, DRAFTED IN THE HOUR IT GOES AND QUEUED ONLY WHEN IT PASSES WHOLE (law 49: "follow ups
 * once"; the communication standard Lawal adopted on 22 November 2026: "one appropriate follow-up"; the PM's 12:11 of
 * 25 November 2026, item 1, under Lawal's standing rule of 12:10). The photo request's follow up is the approved
 * lifecycle_perm_follow_up (./perm-follow-up.ts); the offer's is lifecycle_acq_follow_up (./acq-follow-up.ts).
 *
 * For one first letter a law 49 play sent, inside law 44's window, the shape of ./lifecycle-play.ts:
 *   1. what the follow up needs is read now from production's rows: the contact it went to, the night it named (its
 *      context, event:<id>), any reply from their organisation since, a follow up already drafted or gone, and, for the
 *      photo request, whether the image was given since; a fact that cannot be read means no letter, with why;
 *   2. the event's own clock and the letter's own rules decide whether it is due today (perm_follow_up: once, from T-17,
 *      four days after the request; acq_follow_up: once, from T-14, four days after the offer; never inside T-7);
 *   3. it is drafted HELD in the first letter's thread from the play's own step 2 template, judged by every CRM rule;
 *   4. the gateway judges its exact words as a follow up from the first letter's own mailbox; only a letter with no
 *      held reason and no gateway reason moves to queued, and the database judges that move again.
 * Nothing here sends. A reply, a stop or a grant ends the thread: nothing more is asked.
 */

type Admin = SupabaseClient<Database>

/** Each law 49 letter's follow up subtype, as the class map names it (law 24). */
export const FOLLOW_UP_SUBTYPE: Readonly<Record<LifecycleKey, string>> = { lifecycle_perm: 'PERM-REMINDER', lifecycle_acq: 'ACQ-FOLLOWUP' }

export type FirstLetter = {
  readonly id: string
  readonly contactId: string
  readonly subject: string | null
  readonly contextKey: string | null
  readonly sentAt: string
}

export type FollowUpDraft =
  | { readonly state: 'queued'; readonly touchId: string }
  | { readonly state: 'held'; readonly touchId: string | null; readonly why: readonly string[] }
  | { readonly state: 'refused'; readonly why: string }
  | { readonly state: 'not drafted'; readonly why: string }

const GRANTED = ['organiser_authorised', 'separately_licensed']

/** The night a law 49 letter named, from its context ('event:<id>'), or null. Pure. */
export function eventOfContext(contextKey: string | null): string | null {
  const m = /^event:([0-9a-f-]{36})$/i.exec(contextKey ?? '')
  return m ? m[1] : null
}

type FollowUpRead =
  | {
      readonly state: 'read'
      readonly eventId: string
      readonly event: LetterEvent
      readonly facts: LifecycleFacts
      readonly consent: VoiceConsent
      readonly address: string
      readonly eligible: boolean
      readonly replied: boolean
      readonly granted: boolean
      readonly followUpAt: string | null
      readonly unsubscribeUrl: string | null
    }
  | { readonly state: 'not read'; readonly why: string }

async function readFollowUp(db: Admin, first: FirstLetter, origin: string): Promise<FollowUpRead> {
  const eventId = eventOfContext(first.contextKey)
  if (!eventId) return { state: 'not read', why: 'the first letter names no night in its context, so no follow up can say which night it is about' }
  const contact = await db
    .from('organiser_contacts')
    .select('id, organiser_id, channel, address, person_name, unsubscribe_token, basis, published_on_url, no_marketing_statement_checked')
    .eq('id', first.contactId)
    .single()
  if (contact.error) return { state: 'not read', why: `the contact could not be read: ${contact.error.message}` }
  const organiserId = contact.data.organiser_id as string
  if ((await readPlatformOrganiserIds(db)).has(organiserId)) return { state: 'not read', why: "the platform's own listings organisation, or a test organiser" }
  const org = await db.from('organisers').select('id, name, website_url').eq('id', organiserId).single()
  if (org.error) return { state: 'not read', why: `the organiser could not be read: ${org.error.message}` }
  const theirs = await db.from('organiser_contacts').select('id').eq('organiser_id', organiserId)
  if (theirs.error) return { state: 'not read', why: `their contacts could not be read: ${theirs.error.message}` }
  const ids = (theirs.data ?? []).map((c) => c.id as string)
  // Any reply from their organisation since the first letter ends the thread (a yes, a no, a question or a stop).
  const replies = await db.from('outreach_replies').select('id').in('contact_id', ids).gte('received_at', first.sentAt).limit(1)
  if (replies.error) return { state: 'not read', why: `their replies could not be read: ${replies.error.message}` }
  // One follow up only: one already drafted, queued or gone in this thread (its step 2, this night) is never drafted again.
  const later = await db.from('outreach_touches').select('state, sent_at, drafted_at').in('contact_id', ids).eq('step', 2).eq('context_key', first.contextKey as string).neq('state', 'void')
  if (later.error) return { state: 'not read', why: `their follow ups could not be read: ${later.error.message}` }
  const ev = await db.from('events').select('id, slug, title, start_date, end_date, timezone, status, city_primary, external_ticket_url, cover_image_url').eq('id', eventId).maybeSingle()
  if (ev.error) return { state: 'not read', why: `the night could not be read: ${ev.error.message}` }
  if (!ev.data) return { state: 'not read', why: 'the night it named is no longer listed' }
  const cover = (ev.data.cover_image_url as string | null) ?? null
  const rights = await db.from('event_image_rights').select('image_url, rights_state').eq('event_id', eventId).eq('image_role', 'cover')
  if (rights.error) return { state: 'not read', why: `the night's photo rights could not be read: ${rights.error.message}` }
  const given = await db.from('social_assets').select('id').eq('event_id', eventId).eq('asset_state', 'organiser_authorised').eq('withdrawal_status', 'current').neq('approval_status', 'refused').limit(1)
  if (given.error) return { state: 'not read', why: `the images they gave could not be read: ${given.error.message}` }
  const granted = (cover !== null && (rights.data ?? []).some((r) => r.image_url === cover && GRANTED.includes(r.rights_state as string))) || (given.data ?? []).length > 0
  const token = (contact.data.unsubscribe_token as string | null) ?? null
  const photoLink = token ? `${origin.replace(/\/+$/, '')}${photoPath(contact.data.id as string, token)}` : null
  return {
    state: 'read',
    eventId,
    event: { startDate: ev.data.start_date as string, endDate: (ev.data.end_date as string | null) ?? null, status: (ev.data.status as string | null) ?? null, timezone: (ev.data.timezone as string | null) ?? null },
    facts: {
      organiserName: org.data.name as string,
      personName: (contact.data.person_name as string | null) ?? null,
      websiteUrl: (org.data.website_url as string | null) ?? null,
      night: {
        title: ev.data.title as string,
        slug: (ev.data.slug as string | null) ?? '',
        startDate: ev.data.start_date as string,
        timezone: (ev.data.timezone as string | null) ?? 'Australia/Melbourne',
        citySlug: (ev.data.city_primary as string | null) ?? null,
        bookingUrl: ((ev.data.external_ticket_url as string | null) ?? '').trim() || null,
      },
      photoLink,
      approvalLink: photoLink,
      origin,
    },
    consent: {
      basis: contact.data.basis as string,
      publishedOnUrl: (contact.data.published_on_url as string | null) ?? null,
      noMarketingStatementChecked: contact.data.no_marketing_statement_checked === true,
    },
    address: contact.data.address as string,
    eligible: contact.data.channel === 'email' && contact.data.basis !== 'none',
    replied: (replies.data ?? []).length > 0,
    granted,
    followUpAt: ((later.data ?? [])[0]?.sent_at ?? (later.data ?? [])[0]?.drafted_at ?? null) as string | null,
    unsubscribeUrl: token ? `${origin.replace(/\/+$/, '')}/unsubscribe/outreach?t=${token}` : null,
  }
}

export async function draftLifecycleFollowUp(
  db: Admin,
  input: {
    readonly play: { readonly id: string; readonly name: string }
    readonly key: LifecycleKey
    readonly first: FirstLetter
    readonly templateId: string
    readonly scheduledFor: Date
    readonly origin: string
    readonly actingUser: string
  },
): Promise<FollowUpDraft> {
  if (!inBusinessHours(input.scheduledFor, 'Australia/Melbourne')) {
    return { state: 'not drafted', why: "outside law 44's window: drafted in the hour it goes, so the clock that judges it is that day's" }
  }
  const read = await readFollowUp(db, input.first, input.origin)
  if (read.state !== 'read') return { state: 'not drafted', why: read.why }
  // The clock and the letter's own rules, at the minute it lands (the pure decisions of the two follow up modules).
  const decided =
    input.key === 'lifecycle_perm'
      ? draftPermFollowUp({
          facts: read.facts,
          record: { eligible: read.eligible, replied: read.replied, approved: read.granted, declined: false, requestSentAt: input.first.sentAt, followUpSentAt: read.followUpAt },
          event: read.event,
          unsubscribeUrl: read.unsubscribeUrl,
          threadSubject: input.first.subject,
          now: input.scheduledFor,
        })
      : draftAcqFollowUp({
          facts: read.facts,
          record: { eligible: read.eligible, replied: read.replied, offerSentAt: input.first.sentAt, followUpSentAt: read.followUpAt },
          event: read.event,
          unsubscribeUrl: read.unsubscribeUrl,
          threadSubject: input.first.subject,
          now: input.scheduledFor,
        })
  if (decided.state !== 'drafted') return { state: 'not drafted', why: decided.why }

  const thread = (input.first.subject ?? '').replace(/^(re:\s*)+/i, '').trim() || null
  const drafted = await draftFromTemplate(db, {
    contactId: input.first.contactId,
    templateKey: `play ${input.play.name} step 2`,
    templateId: input.templateId,
    purpose: 'cadence',
    step: 2,
    playId: input.play.id,
    extraFields: { ...lifecycleFields(read.facts), 'thread subject': thread },
    // One sequence, one context: the follow up keeps its first letter's night.
    contextKey: input.first.contextKey,
    inReplyTo: null,
    scheduledFor: input.scheduledFor,
    origin: input.origin,
    draftedBy: input.actingUser,
  })
  if (drafted.state === 'refused') return { state: 'refused', why: drafted.reason }
  if (drafted.state === 'held by policy') return { state: 'held', touchId: null, why: [drafted.reason] }
  if (drafted.value.heldBecause.length > 0) return { state: 'held', touchId: drafted.value.id, why: drafted.value.heldBecause }

  const touch = await db.from('outreach_touches').select('subject, body').eq('id', drafted.value.id).single()
  if (touch.error) return { state: 'held', touchId: drafted.value.id, why: [`the draft could not be read back: ${touch.error.message}`] }
  // From the first letter's own mailbox (law 33 (a): PERM from hello@, ACQ from lawal@), as a follow up in its thread.
  const box = mailboxFor({ category: LIFECYCLE_SUBTYPE[input.key].split('-')[0], purpose: 'cadence' })
  if ('refused' in box) return { state: 'held', touchId: drafted.value.id, why: [box.refused] }
  const voice = voiceProblems(
    {
      ...touchVoiceMessage({
        channel: 'email',
        purpose: 'cadence',
        step: 2,
        address: read.address,
        subject: touch.data.subject as string | null,
        body: touch.data.body as string,
        personName: read.facts.personName,
        organiserName: read.facts.personName ? read.facts.organiserName : greetingOf(read.facts.organiserName, null).replace(/ team$/, ''),
        firstTouchId: input.first.id,
        // A follow up's own class (src/lib/comms/categories.ts): PERM-REMINDER, ACQ-FOLLOWUP.
        subtype: FOLLOW_UP_SUBTYPE[input.key],
      }),
      from: box.mailbox,
      consent: read.consent,
      eventDate: melbourneDayOf(read.facts.night.startDate, read.facts.night.timezone),
      landsOn: melbourneDayOf(input.scheduledFor.toISOString()),
    },
    readVoicePolicy(),
  )
  if (voice.length > 0) {
    await db.from('outreach_touches').update({ held_because: voice }).eq('id', drafted.value.id).eq('state', 'held')
    return { state: 'held', touchId: drafted.value.id, why: voice }
  }
  const queued = await db
    .from('outreach_touches')
    .update({ state: 'queued', scheduled_for: input.scheduledFor.toISOString(), provider: 'graph' })
    .eq('id', drafted.value.id)
    .eq('state', 'held')
    .select('id')
    .maybeSingle()
  if (queued.error || !queued.data) return { state: 'held', touchId: drafted.value.id, why: [queued.error?.message.replace(/^refused: /, '') ?? 'it was no longer held'] }
  return { state: 'queued', touchId: drafted.value.id }
}

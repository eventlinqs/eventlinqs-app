import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { mailboxFor } from './addresses'
import { draftFromTemplate } from './drafts'
import { readLifecycleFacts } from './lifecycle-read'
import { LIFECYCLE_SUBTYPE, lifecycleFields, type LifecycleKey } from './lifecycle-letters'
import { greetingOf, melbourneDayOf } from './segment-a-letter'
import { inBusinessHours } from './sender'
import { touchVoiceMessage } from './touch-voice'
import { readVoicePolicy, voiceProblems } from './voice-gate'

/**
 * A LAW 49 PLAY'S LETTER, DRAFTED IN THE HOUR IT GOES AND QUEUED ONLY WHEN IT PASSES WHOLE (law 49; the shape of
 * ./segment-a-play.ts, under the communication standard's Part 2 rule 8: "Lawal approves each template ONCE, from real
 * samples ... every message made from that approved template and passing the gate sends inside business hours").
 *
 * The approval is the play's: outreach_plays approved by a person, its template version fixed, whose first letter is
 * lifecycle_perm (PERM, from hello@) or lifecycle_acq (ACQ, from lawal@; the sender picks the mailbox by the class,
 * ./addresses.ts). Its pause is the one switch that stops it, and the sender's mode (hold, test, live) stands above it.
 * For one contact the cohort reached, inside law 44's window:
 *   1. the facts are read now (./lifecycle-read.ts), the event clock deciding whether the letter is due today and on
 *      which night; not due, or a fact that cannot be read, means no letter, with why;
 *   2. the letter is drafted HELD from the play's own template version, judged by every CRM rule (./drafts.ts);
 *   3. the gateway judges its exact words with its class, consent basis and timing (./voice-gate.ts);
 *   4. only a letter with no held reason and no gateway reason moves to queued; the database judges that move again and
 *      a refusal leaves it held. Anything else stays held with its reasons, for Lawal to see.
 * Nothing here sends.
 */

type Admin = SupabaseClient<Database>

export type LifecycleDraft =
  | { readonly state: 'queued'; readonly touchId: string }
  | { readonly state: 'held'; readonly touchId: string | null; readonly why: readonly string[] }
  | { readonly state: 'refused'; readonly why: string }
  | { readonly state: 'not drafted'; readonly why: string }

export async function draftLifecycleLetter(
  db: Admin,
  input: {
    readonly play: { readonly id: string; readonly name: string }
    readonly key: LifecycleKey
    readonly contactId: string
    readonly templateId: string
    readonly scheduledFor: Date
    readonly now: Date
    readonly origin: string
    readonly actingUser: string
  },
): Promise<LifecycleDraft> {
  if (!inBusinessHours(input.scheduledFor, 'Australia/Melbourne')) {
    return { state: 'not drafted', why: "outside law 44's window: drafted in the hour it goes, so its days to go are that day's" }
  }
  const read = await readLifecycleFacts(db, { key: input.key, playId: input.play.id, contactId: input.contactId, now: input.now, origin: input.origin })
  if (read.state !== 'read') return { state: 'not drafted', why: read.why }

  const landsOn = melbourneDayOf(input.scheduledFor.toISOString())
  const drafted = await draftFromTemplate(db, {
    contactId: read.recipientId,
    templateKey: `play ${input.play.name} step 1`,
    templateId: input.templateId,
    purpose: 'cadence',
    step: 1,
    playId: input.play.id,
    extraFields: lifecycleFields(read.facts, input.scheduledFor),
    inReplyTo: null,
    scheduledFor: input.scheduledFor,
    origin: input.origin,
    draftedBy: input.actingUser,
  })
  if (drafted.state === 'refused') return { state: 'refused', why: drafted.reason }
  if (drafted.value.heldBecause.length > 0) return { state: 'held', touchId: drafted.value.id, why: drafted.value.heldBecause }

  const touch = await db.from('outreach_touches').select('subject, body').eq('id', drafted.value.id).single()
  const contact = await db.from('organiser_contacts').select('address').eq('id', read.recipientId).single()
  if (touch.error || contact.error) return { state: 'held', touchId: drafted.value.id, why: [`the draft could not be read back: ${(touch.error ?? contact.error)?.message}`] }
  // The gateway judges it from the mailbox it will really go from (law 33 (a): PERM from hello@, ACQ from lawal@), so a
  // recipient whose thread belongs to the other mailbox (the gateway's threads list) is held, never sent from the wrong one.
  const box = mailboxFor({ category: LIFECYCLE_SUBTYPE[input.key].split('-')[0], purpose: 'cadence' })
  if ('refused' in box) return { state: 'held', touchId: drafted.value.id, why: [box.refused] }
  const voice = voiceProblems(
    {
      ...touchVoiceMessage({
        channel: 'email',
        purpose: 'cadence',
        step: 1,
        address: contact.data.address as string,
        subject: touch.data.subject as string | null,
        body: touch.data.body as string,
        // The verified recipient as the letter greets them (greetingOf, from the organiser's own row): their first name, or
        // the organisation without a leading 'The', a bracketed part or an 'at <venue>' tail, and 'team'.
        personName: read.facts.personName,
        organiserName: read.facts.personName ? read.facts.organiserName : greetingOf(read.facts.organiserName, null).replace(/ team$/, ''),
        firstTouchId: null,
        subtype: LIFECYCLE_SUBTYPE[input.key],
      }),
      from: box.mailbox,
      consent: read.consent,
      eventDate: read.eventDate,
      landsOn,
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

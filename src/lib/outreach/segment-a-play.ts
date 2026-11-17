import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { draftFromTemplate } from './drafts'
import { readSegmentAFacts } from './segment-a-read'
import { melbourneDayOf, segmentAFields } from './segment-a-letter'
import { inBusinessHours } from './sender'
import { touchVoiceMessage } from './touch-voice'
import { readVoicePolicy, voiceProblems } from './voice-gate'

/**
 * A SEGMENT A PLAY'S LETTER, DRAFTED IN THE HOUR IT GOES AND QUEUED ONLY WHEN IT PASSES WHOLE (the PM's 02:00 of
 * 18 November 2026, item 2, under the communication standard's Part 2 rule 8: "Lawal approves each template ONCE, from
 * real samples ... every message made from that approved template and passing the gate sends inside business hours").
 *
 * The approval is the play's: a play Lawal approved (outreach_plays, approved by a person, its template versions fixed,
 * migration 20261028213001), whose first letter is segment_a_first. Its pause is the one switch that stops it, and the
 * sender's mode (hold, test, live) stands above it. For one contact, in a Melbourne business hour:
 *   1. the facts are read now (./segment-a-read.ts): their nights, booking pages, the night it names, the people who
 *      opened their pages through the one key reader; a fact that cannot be read means no letter, with why;
 *   2. the letter is drafted HELD from the play's own template version, judged by every CRM rule (./drafts.ts);
 *   3. the gateway judges its exact words with its consent basis and timing (./voice-gate.ts, Part 2 rule 7);
 *   4. only a letter with no held reason and no gateway reason moves to queued, for the sender to send in the
 *      recipient's business hours; the database judges that move again (outreach_touch_is_lawful, the page check) and a
 *      refusal leaves it held. Anything else stays held with its reasons, for Lawal to see.
 * Nothing here sends.
 */

type Admin = SupabaseClient<Database>

export type SegmentADraft =
  | { readonly state: 'queued'; readonly touchId: string }
  | { readonly state: 'held'; readonly touchId: string | null; readonly why: readonly string[] }
  | { readonly state: 'refused'; readonly why: string }
  | { readonly state: 'not drafted'; readonly why: string }

export async function draftSegmentALetter(
  db: Admin,
  input: {
    readonly play: { readonly id: string; readonly name: string }
    readonly contactId: string
    readonly step: 1 | 2 | 3
    readonly templateId: string
    readonly scheduledFor: Date
    readonly now: Date
    readonly origin: string
    readonly actingUser: string
    /** For a follow up: the first letter, whose thread and subject it keeps. */
    readonly first?: { readonly id: string; readonly subject: string | null }
  },
): Promise<SegmentADraft> {
  if (!inBusinessHours(input.scheduledFor, 'Australia/Melbourne')) {
    return { state: 'not drafted', why: 'outside a Melbourne business hour: drafted in the hour it goes, so its numbers are that hour' }
  }
  // A segment A letter already held for this contact and step is not drafted again each hour (it waits, with its
  // reasons, where Lawal sees it); checked before anything is read.
  const mine = await db.from('outreach_touches').select('id, contact_id, outreach_templates(key)').eq('contact_id', input.contactId).eq('step', input.step).eq('state', 'held')
  if (mine.error) return { state: 'not drafted', why: `their held messages could not be read: ${mine.error.message}` }
  const keyOf = (t: unknown) => ((t as { outreach_templates: { key: string } | null }).outreach_templates?.key ?? '')
  if ((mine.data ?? []).some((t) => keyOf(t).startsWith('segment_a_'))) {
    return { state: 'not drafted', why: 'a segment A letter for this step is already held for them, with its reasons' }
  }
  const landsOn = melbourneDayOf(input.scheduledFor.toISOString())
  const read = await readSegmentAFacts(db, { contactId: input.contactId, landsOn, now: input.now, origin: input.origin })
  if (read.state === 'not read') return { state: 'not drafted', why: read.why }

  // THE DRAFTS THIS LETTER SUPERSEDES (the communication standard of 17 November 2026: "It supersedes the 'could I ask
  // your advice?' first letter"): a first message of the twenty still held on any of the organiser's contacts is voided
  // with why, never deleted, as the twenty itself retires an older version; the database keeps one conversation per
  // organiser. Only for the first letter: a follow up belongs to a letter already sent.
  if (input.step === 1) {
    const theirs = await db.from('organiser_contacts').select('id').eq('organiser_id', read.organiserId)
    if (theirs.error) return { state: 'not drafted', why: `their contacts could not be read: ${theirs.error.message}` }
    const held = await db
      .from('outreach_touches')
      .select('id, contact_id, outreach_templates(key)')
      .in('contact_id', (theirs.data ?? []).map((c) => c.id as string))
      .eq('state', 'held')
      .eq('purpose', 'cadence')
    if (held.error) return { state: 'not drafted', why: `their held drafts could not be read: ${held.error.message}` }
    for (const t of held.data ?? []) {
      if (keyOf(t).startsWith('segment_a_')) continue
      await db
        .from('outreach_touches')
        .update({ state: 'void', void_reason: "Superseded by the segment A letter (the communication standard of 17 November 2026; the PM's 02:00 of 18 November 2026)." })
        .eq('id', (t as { id: string }).id)
        .eq('state', 'held')
    }
  }

  const thread = input.first ? (input.first.subject ?? '').replace(/^(re:\s*)+/i, '').trim() || null : null
  const drafted = await draftFromTemplate(db, {
    contactId: input.contactId,
    templateKey: `play ${input.play.name} step ${input.step}`,
    templateId: input.templateId,
    purpose: 'cadence',
    step: input.step,
    playId: input.play.id,
    extraFields: { ...segmentAFields(read.facts), 'thread subject': thread },
    inReplyTo: null,
    scheduledFor: input.scheduledFor,
    origin: input.origin,
    draftedBy: input.actingUser,
  })
  if (drafted.state === 'refused') return { state: 'refused', why: drafted.reason }
  if (drafted.value.heldBecause.length > 0) return { state: 'held', touchId: drafted.value.id, why: drafted.value.heldBecause }

  const touch = await db.from('outreach_touches').select('subject, body').eq('id', drafted.value.id).single()
  const contact = await db.from('organiser_contacts').select('address').eq('id', input.contactId).single()
  if (touch.error || contact.error) return { state: 'held', touchId: drafted.value.id, why: [`the draft could not be read back: ${(touch.error ?? contact.error)?.message}`] }
  const voice = voiceProblems(
    {
      ...touchVoiceMessage({
        channel: 'email',
        purpose: 'cadence',
        step: input.step,
        address: contact.data.address as string,
        subject: touch.data.subject as string | null,
        body: touch.data.body as string,
        personName: read.facts.personName,
        organiserName: read.facts.organiserName,
        firstTouchId: input.first?.id ?? null,
      }),
      consent: read.consent,
      eventDate: read.eventDate,
      landsOn,
    },
    readVoicePolicy(),
  )
  if (voice.length > 0) {
    // Recorded on the draft where the database allows it, so Lawal sees why; it stays held either way.
    await db.from('outreach_touches').update({ held_because: voice }).eq('id', drafted.value.id).eq('state', 'held')
    return { state: 'held', touchId: drafted.value.id, why: voice }
  }
  const queued = await db
    .from('outreach_touches')
    .update({ state: 'queued', scheduled_for: input.scheduledFor.toISOString() })
    .eq('id', drafted.value.id)
    .eq('state', 'held')
    .select('id')
    .maybeSingle()
  if (queued.error || !queued.data) return { state: 'held', touchId: drafted.value.id, why: [queued.error?.message.replace(/^refused: /, '') ?? 'it was no longer held'] }
  return { state: 'queued', touchId: drafted.value.id }
}

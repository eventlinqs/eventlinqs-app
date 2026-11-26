import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { decisionWords, readContactPolicy } from './contact-policy'
import { refusalFromError, type Done } from './crm'
import { FIRST_LETTER_WRITTEN, readFirstLetterRecord } from './first-letter-record'
import { firstLetterBlocked } from './one-first-letter'

/**
 * THE SOCIAL PILOT'S MESSAGES, RECORDED (Lawal's ruling of 23:01 on 26 November 2026, law 31 narrowed; EVENTLINQS-SOCIAL-
 * ORGANISER-ENGINE-LOCKED-26NOV.md version 2, section 4; the PM's car K lean, item K3). A person sends a direct message on
 * Instagram or Facebook, from EventLinqs' account, to an organiser the PM qualified into the pilot (at most 20, each with
 * its business enquiry basis on the contact, migration 20261126200002). This records that message as an outreach touch on
 * that contact: the channel is the contact's, sent_by the person, sent_at when, and the database keeps the pilot basis
 * beside the basis it relied on (outreach_touch_wants_its_pilot_place). Stops, replies, the one live cadence per
 * organiser over 30 days and the follow up days are the email rules, judged again by the database
 * (outreach_touch_is_lawful). Nothing here sends: there is no sending code for a direct message, and none is allowed.
 */

type Admin = SupabaseClient<Database>

export const PILOT_CHANNELS = ['instagram', 'facebook'] as const
export type PilotChannel = (typeof PILOT_CHANNELS)[number]
export const PILOT_MOST = 20
/** The thread every pilot message and its follow ups share, so the database finds step 1 when step 2 is recorded. */
export const PILOT_CONTEXT = 'pilot:social'

const OPENING = /^Hi [^,\p{Cc}]{1,80},/u
const DASHES = /[\u2013\u2014]/
const STOP_LINE = /reply\s+stop/i
const UNSUBSCRIBE = 'https://www.eventlinqs.com.au/unsubscribe/outreach'

export type PilotMessage = { readonly body: string; readonly sentAt: string; readonly step: number }

/** Why the message as written cannot be recorded, in words; empty when it can. The database's own rules, said first. Pure. */
export function pilotMessageProblems(m: PilotMessage, now: Date): string[] {
  const why: string[] = []
  const body = m.body.trim()
  if (!OPENING.test(body)) why.push('it must open with Hi, their first name or their team, and a comma')
  if (!body.includes('EventLinqs')) why.push('it must name EventLinqs')
  if (!STOP_LINE.test(body) && !body.includes(UNSUBSCRIBE)) why.push('it must carry a reply STOP line')
  if (DASHES.test(body)) why.push('it carries an em or en dash')
  if (body.includes('!')) why.push('it carries an exclamation mark')
  const at = Date.parse(m.sentAt)
  if (Number.isNaN(at)) why.push('when it was sent is not a time')
  else if (at > now.getTime() + 5 * 60_000) why.push('it cannot be sent in the future')
  if (![1, 2, 3].includes(m.step)) why.push('a pilot message is step 1, 2 or 3')
  return why
}

/** One message a person sent on Instagram or Facebook, recorded on its pilot contact. */
export async function recordPilotMessage(
  db: Admin,
  input: { contactId: string; body: string; sentAt: string; sentBy: string; step?: 1 | 2 | 3 },
  now: Date,
): Promise<Done<{ id: string }>> {
  const step = input.step ?? 1
  const problems = pilotMessageProblems({ body: input.body, sentAt: input.sentAt, step }, now)
  if (problems.length) return { state: 'refused', reason: `Not recorded: ${problems.join('; ')}.` }
  const contact = await db.from('organiser_contacts').select('id, channel, pilot_qualified_at').eq('id', input.contactId).maybeSingle()
  if (contact.error) return { state: 'refused', reason: refusalFromError(contact.error) }
  if (!contact.data) return { state: 'refused', reason: 'That contact is not in the CRM.' }
  if (!(PILOT_CHANNELS as readonly string[]).includes(contact.data.channel)) return { state: 'refused', reason: 'Only an Instagram or Facebook contact is in the social pilot.' }
  if (!contact.data.pilot_qualified_at) return { state: 'refused', reason: 'That contact is not qualified into the social pilot, so no message to it can be recorded.' }
  // The one contact policy, as every message (./contact-policy.ts): a stop, a reply, another live cadence, all said.
  const decision = await readContactPolicy(db, { contactId: input.contactId, purpose: 'cadence', step, templateKey: null, moment: 'send' }, now)
  if (decision.state === 'unread') return { state: 'refused', reason: `whether they may be written to could not be read: ${decision.why}` }
  if (decision.state === 'held') return { state: 'refused', reason: decisionWords(decision) }
  if (step === 1) {
    const record = await readFirstLetterRecord(db, { contactId: input.contactId }, FIRST_LETTER_WRITTEN)
    if (record === null) return { state: 'refused', reason: 'whether their organisation was already written to could not be read; not recorded on a guess' }
    const written = firstLetterBlocked(record)
    if (written) return { state: 'refused', reason: written }
  }
  const r = await db
    .from('outreach_touches')
    .insert({
      contact_id: input.contactId,
      purpose: 'cadence',
      step,
      state: 'sent',
      provider: 'by_hand',
      sent_at: new Date(Date.parse(input.sentAt)).toISOString(),
      sent_by: input.sentBy,
      body: input.body.trim(),
      drafted_by: input.sentBy,
      context_key: PILOT_CONTEXT,
      comms_source: 'manual',
      comms_category: 'ACQ',
      comms_subtype: step === 1 ? 'ACQ-FIRST' : 'ACQ-FOLLOWUP',
    })
    .select('id')
    .single()
  if (r.error || !r.data) return { state: 'refused', reason: refusalFromError(r.error) }
  return { state: 'done', value: r.data }
}

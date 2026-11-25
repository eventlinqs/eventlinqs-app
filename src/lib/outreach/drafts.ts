/**
 * ONE MESSAGE FROM A TEMPLATE ROW, STORED HELD (window 6, 28 October 2026; window 2, 31 October 2026).
 *
 * The newest version of the template is filled from the contact's verified facts (src/lib/outreach/facts.ts) and judged
 * by every rule of the messages file (src/lib/outreach/rules.ts); one that fails any rule is stored with the rules named
 * (the project manager's 20:10). Every message is stored HELD: nothing leaves held by itself (Lawal's zero-bypass
 * directive, the CONTROLLER's 08:40 of 31 October 2026). It waits on the daily queue in /admin/acquisition, where the
 * communication gateway (voice-gate.ts) judges its words and Lawal approves those exact words before it is recorded as
 * sent. Until 31 October an email inside an approved play was stored QUEUED for the sender here; that ended. The
 * database judges it again and refuses what it must (migrations 213001 and 224001), in its own words.
 *
 * THE CONTACT POLICY FIRST, THE CONTEXT WITH IT (Lawal, 23 November 2026, 01:51, through the PM's 01:52, items 1 and 2):
 * every workflow drafts through here, so before a word is written the one contact policy (./contact-policy.ts) reads
 * every message to the organiser, its replies, suppression, opt outs and bounces; a letter it holds is not drafted, and
 * the caller is told the rule, the reason and the next eligible date. A drafted message carries its context (the event
 * or campaign it is about), which with its category and step is the database's duplicate key (migration 20261123020001):
 * two runs drafting the same letter at once leave one row, and the second is told, in plain words, that it is already
 * drafted (refusalFromError), never an error that stops its run.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { goalLinesFor, readDueGoals, withGoalLines } from './goals'
import { renderTemplate, type MessageChannel, type MessagePurpose } from './rules'
import { factsForContact } from './facts'
import { refusalFromError, type Done } from './crm'
import { decisionWords, readContactPolicy, type PolicyRule } from './contact-policy'
import { firstLetterBlocked } from './one-first-letter'
import { FIRST_LETTER_WRITTEN, readFirstLetterRecord } from './first-letter-record'

type Admin = SupabaseClient<Database>

/** Messages that carry nothing more than their own words: a removal confirmed, a stop confirmed. */
const NO_GOALS: ReadonlySet<string> = new Set(['withdrawal_confirmed', 'reply_stop', 'reply_take_down'])

export type DraftRequest = {
  contactId: string
  /** The newest version of this key, unless templateId pins the exact version (a play's approved version). */
  templateKey: string
  templateId?: string | null
  purpose: MessagePurpose
  step?: 1 | 2 | 3 | null
  playId?: string | null
  /** Facts the caller holds that the rows do not: the thread's subject, a provider name, figures for a report. */
  extraFields?: Record<string, string | null>
  /** The inbound message this answers, so it sits in their thread. */
  inReplyTo?: string | null
  /** Message 8: the night report it was drafted from; the database holds one live message per report. */
  nightReportId?: string | null
  /** The learning loop: the half a play's first message counts in while its test is open (src/lib/outreach/learning.ts). */
  half?: 'a' | 'b' | null
  /** Message 7: the partner's own tracked link the message carries, which also keeps it to one per kit. */
  trackedLink?: string | null
  /**
   * The organiser's own page the line about their event was read from, and the date read (organiser_page_events; Lawal,
   * 13 November 2026, 06:50, ruling 1), kept on the draft like a basis. Null when the line names a night on EventLinqs.
   */
  lineSource?: { readonly url: string; readonly readOn: string } | null
  /**
   * What the message is about, part of its duplicate key (migration 20261123020001): ./contact-policy.ts contextKeys,
   * 'event:<events.id>' for a letter about a night, 'play:<outreach_plays.id>' for a play's campaign letter with no night,
   * and so on; a follow up passes its first letter's. Null where it has none.
   */
  contextKey?: string | null
  scheduledFor: Date
  origin: string
  draftedBy: string
}

/**
 * Drafted (held), refused (the database's words, or a read that failed), or HELD BY THE CONTACT POLICY: nothing is
 * drafted, and the caller reports the rule, the reason and the next eligible moment (null: not by waiting).
 */
export type DraftResult =
  | Done<{ id: string; state: 'held'; heldBecause: string[] }>
  | { state: 'held by policy'; rule: PolicyRule; reason: string; nextEligibleAt: string | null }

export async function draftFromTemplate(db: Admin, r: DraftRequest): Promise<DraftResult> {
  const template = r.templateId
    ? await db.from('outreach_templates').select('id, key, channel, purpose, step, subject, body').eq('id', r.templateId).maybeSingle()
    : await db
        .from('outreach_templates')
        .select('id, key, channel, purpose, step, subject, body')
        .eq('key', r.templateKey)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
  if (template.error || !template.data) return { state: 'refused', reason: `no template ${r.templateKey}` }
  const step = r.purpose === 'cadence' ? (r.step ?? 1) : null

  // THE ONE CONTACT POLICY, before a word is written, judged at the minute the letter would land.
  const decision = await readContactPolicy(
    db,
    { contactId: r.contactId, purpose: r.purpose, step, templateKey: (template.data.key as string | null) ?? null, moment: 'draft' },
    r.scheduledFor,
  )
  if (decision.state === 'unread') return { state: 'refused', reason: `whether they may be written to now could not be read: ${decision.why}` }
  if (decision.state === 'held') return { state: 'held by policy', rule: decision.rule, reason: decisionWords(decision), nextEligibleAt: decision.nextEligibleAt }
  // ONE FIRST LETTER PER ORGANISATION, BEFORE IT IS DRAFTED (the coordinator's order of 23 November 2026, train seven):
  // the sender's own rule (./one-first-letter.ts, read by ./first-letter-record.ts), by organiser and by address domain,
  // with a letter queued or being sent counted as written. At 22:15 that night a play drafted a source ask to
  // marketing@ballarat.vic.gov.au though balc@ballarat.vic.gov.au had been written to: the contact policy reads by
  // organiser only, and only the sender read this rule, so a letter it would refuse was drafted and sat held.
  if (r.purpose === 'cadence' && step === 1) {
    const record = await readFirstLetterRecord(db, { contactId: r.contactId }, FIRST_LETTER_WRITTEN)
    if (record === null) return { state: 'refused', reason: 'whether their organisation was already written to could not be read; not drafted on a guess' }
    const written = firstLetterBlocked(record)
    if (written) return { state: 'refused', reason: written }
  }
  const contact = await db.from('organiser_contacts').select('channel, unsubscribe_token').eq('id', r.contactId).single()
  if (contact.error) return { state: 'refused', reason: refusalFromError(contact.error) }

  const facts = { ...(await factsForContact(db, r.contactId, r.origin)), ...(r.extraFields ?? {}) }
  const unsubscribe = contact.data.channel === 'email' ? `${r.origin.replace(/\/+$/, '')}/unsubscribe/outreach?t=${contact.data.unsubscribe_token}` : null
  const shape = {
    channel: template.data.channel as MessageChannel,
    purpose: template.data.purpose as MessagePurpose,
    step: template.data.step,
    subject: template.data.subject,
    body: template.data.body as string,
  }
  let rendered = renderTemplate(shape, facts, unsubscribe)
  // ONE MESSAGE CARRIES EVERY GOAL (Lawal, 26 November 2026, 00:01; the PM's 00:02 item A; ./goals.ts): a relationship
  // message to a partner in conversation carries every goal of theirs that is due, one short line each, before its sign
  // off, and the whole letter is rendered and checked again as one. A cold letter keeps its one category (law 24, never
  // mixed) and the gap spaces those; a confirmation of a removal or a stop carries nothing more. A goals read that fails
  // leaves the message as its template wrote it, and says so.
  const key = (template.data.key as string | null) ?? null
  if (shape.purpose === 'relationship' && contact.data.channel === 'email' && !(key && NO_GOALS.has(key))) {
    const goals = await readDueGoals(db, { contactId: r.contactId, origin: r.origin, now: r.scheduledFor }).catch((err: unknown) => {
      console.error(`[outreach/drafts] contact ${r.contactId}: their goals could not be read, so the message carries its own alone:`, err instanceof Error ? err.message : String(err))
      return null
    })
    const lines = goals ? goalLinesFor(goals, { templateKey: key, words: rendered.body }) : []
    if (lines.length > 0) rendered = renderTemplate({ ...shape, body: withGoalLines(shape.body, lines) }, facts, unsubscribe)
  }

  // Nothing is queued for the sender from here: Lawal approves each message's exact words first (voice-gate.ts).
  const state = 'held' as const
  const row = await db
    .from('outreach_touches')
    .insert({
      contact_id: r.contactId,
      purpose: r.purpose,
      step,
      template_id: template.data.id,
      context_key: r.contextKey ?? null,
      play_id: r.playId ?? null,
      subject: rendered.subject,
      body: rendered.body,
      held_because: rendered.heldBecause,
      state,
      provider: null,
      scheduled_for: null,
      in_reply_to: r.inReplyTo ?? null,
      night_report_id: r.nightReportId ?? null,
      half: r.half ?? null,
      tracked_link: r.trackedLink ?? null,
      line_source_url: r.lineSource?.url ?? null,
      line_read_on: r.lineSource?.readOn ?? null,
      drafted_by: r.draftedBy,
    })
    .select('id')
    .single()
  if (row.error) return { state: 'refused', reason: refusalFromError(row.error) }
  return { state: 'done', value: { id: row.data.id, state, heldBecause: rendered.heldBecause } }
}

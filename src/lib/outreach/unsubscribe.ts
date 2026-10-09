/**
 * THE OUTREACH UNSUBSCRIBE: WHAT A SUBMISSION MAY CONTAIN, HOW IT IS RECORDED,
 * AND WHAT THE FOUNDER IS TOLD.
 *
 * The founder emails event organisers one to one from Outlook. Each message
 * carries an Unsubscribe link to /unsubscribe/outreach?id=<HubSpot contact id>.
 * This module is everything about that page that is not the page: the reasons,
 * the server side validation, the write, and the alert. It imports nothing that
 * needs a request, a database or a mailbox, so every rule here is unit tested
 * (tests/unit/outreach/outreach-unsubscribe.test.ts).
 *
 * THE EVIDENCE, fetched 2026-10-03:
 *
 *   ACMA, the Spam Act facility: it "honours a request to unsubscribe within 5
 *   working days", "is functional for at least 30 days after you sent the
 *   message", and "does not require the person to give extra personal
 *   information or log in to, or create, an account".
 *   https://www.acma.gov.au/avoid-sending-spam
 *
 *   Yahoo sender requirements: "Have a clearly visible unsubscribe link in the
 *   email body - this may direct to a preference page"; "Honor unsubscribes
 *   within 2 days".
 *   https://senders.yahooinc.com/best-practices/
 *
 *   HubSpot: after unsubscribing, "a confirmation page containing a survey
 *   asking why they unsubscribed", with fixed reasons and Other.
 *   https://knowledge.hubspot.com/marketing-email/redirect-contacts-to-an-unsubscribe-survey
 *   HubSpot one to one email: "An unsubscribe link will be included at the
 *   bottom of all one-to-one emails."
 *   https://knowledge.hubspot.com/one-to-one-email/manage-unsubscribe-links-for-one-to-one-emails
 *
 *   Klaviyo opt out survey: radio buttons for the reason, plus a text area for
 *   anything else.
 *   https://www.klaviyo.com/blog/solution-recipe-16-opt-out-survey-capture-and-record-an-unsubscribe-reason-when-customers-opt-out
 *
 * THREE RULES THE CODE BELOW HOLDS, each from that evidence.
 *
 *   1. The reason and the comment are OPTIONAL. Unsubscribing never depends on
 *      either (ACMA: no extra information may be required).
 *   2. The address is asked for ONLY when the link carried no usable contact
 *      id, because then it is the only way to say who is asking.
 *   3. A failed write is never reported as an unsubscribe. The recorder throws,
 *      so the page's error boundary says try again, which is true. Telling
 *      somebody they are unsubscribed when nothing was recorded means they keep
 *      receiving mail they asked to stop.
 */

import { escapeHtml } from '@/lib/email/escape'

/**
 * The reasons offered on the page, in the order shown. `value` is what the
 * database stores and is mirrored by the check constraint in
 * supabase/migrations/20261003000010_an_outreach_unsubscribe_is_honoured.sql.
 */
export const OUTREACH_UNSUBSCRIBE_REASONS = [
  { value: 'too_many_emails', label: 'Too many emails' },
  { value: 'not_relevant', label: 'Not relevant to our events' },
  { value: 'happy_with_current_platform', label: "We're happy with our current ticketing platform" },
  { value: 'not_the_right_person', label: "I'm not the right person to contact" },
  { value: 'other', label: 'Other' },
] as const

export type OutreachUnsubscribeReason = (typeof OUTREACH_UNSUBSCRIBE_REASONS)[number]['value']

/** The longest comment accepted, matching the textarea and the database. */
export const OUTREACH_COMMENT_MAX = 1000

/**
 * A HubSpot contact record id is numeric. Anchored at both ends and without a
 * `g` flag, the two ways a shape test can look right and be wrong: an unanchored
 * one accepts anything CONTAINING digits, and a global one carries lastIndex
 * between calls so the same id alternates valid and invalid.
 */
export const HUBSPOT_CONTACT_ID_SHAPE = /^\d{1,20}$/

/** True when `value` can be a HubSpot contact id. */
export function isHubspotContactId(value: unknown): value is string {
  return typeof value === 'string' && HUBSPOT_CONTACT_ID_SHAPE.test(value)
}

/** One spelling per address: trimmed and lower case, as the database requires. */
export function normaliseOutreachEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** The same deliberately simple address test the rights form uses. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** RFC 5321 caps a forward path at 256 octets including the angle brackets. */
const EMAIL_MAX = 254

export type OutreachUnsubscribeRecord = {
  hubspotContactId: string | null
  email: string | null
  reason: OutreachUnsubscribeReason | null
  comment: string | null
}

export type OutreachUnsubscribeField = 'email' | 'reason' | 'comment'

export type ParsedOutreachUnsubscribe =
  | { ok: true; value: OutreachUnsubscribeRecord }
  | { ok: false; field: OutreachUnsubscribeField; message: string }

/** What a form submission carries, before anything is trusted. */
export type OutreachUnsubscribeSubmission = {
  id?: unknown
  email?: unknown
  reason?: unknown
  comment?: unknown
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Validate a submission on the SERVER. Nothing from the browser is trusted: the
 * hidden id, the radio value and the comment length are all re-checked here.
 *
 * A malformed id is not an error. It is treated exactly as a missing one, so the
 * person is asked for their address and can still unsubscribe.
 */
export function parseOutreachUnsubscribe(input: OutreachUnsubscribeSubmission): ParsedOutreachUnsubscribe {
  const rawId = text(input.id).trim()
  const hubspotContactId = isHubspotContactId(rawId) ? rawId : null

  let email: string | null = null
  if (hubspotContactId === null) {
    const candidate = normaliseOutreachEmail(text(input.email))
    if (!EMAIL_SHAPE.test(candidate) || candidate.length > EMAIL_MAX) {
      return {
        ok: false,
        field: 'email',
        message: "Enter the email address you'd like to unsubscribe.",
      }
    }
    email = candidate
  }

  const rawReason = text(input.reason).trim()
  let reason: OutreachUnsubscribeReason | null = null
  if (rawReason !== '') {
    const known = OUTREACH_UNSUBSCRIBE_REASONS.find((r) => r.value === rawReason)
    if (!known) {
      return {
        ok: false,
        field: 'reason',
        message: 'Choose one of the reasons listed, or leave it blank.',
      }
    }
    reason = known.value
  }

  /*
   * A browser submits a textarea's line breaks as CRLF while its maxlength
   * counts each break once, so a comment that fitted the box would arrive up
   * to one character per line too long. Normalised to LF before it is measured.
   */
  const rawComment = text(input.comment).replace(/\r\n?/g, '\n').trim()
  if (rawComment.length > OUTREACH_COMMENT_MAX) {
    return {
      ok: false,
      field: 'comment',
      message: 'Please keep your comment to 1,000 characters or fewer.',
    }
  }
  const comment = rawComment === '' ? null : rawComment

  return { ok: true, value: { hubspotContactId, email, reason, comment } }
}

/** The label shown on the page for a stored reason. */
export function outreachReasonLabel(reason: OutreachUnsubscribeReason | null): string {
  if (reason === null) return 'No reason given'
  return OUTREACH_UNSUBSCRIBE_REASONS.find((r) => r.value === reason)?.label ?? reason
}

/** The row as the database spells it. */
export type OutreachUnsubscribeRow = {
  hubspot_contact_id: string | null
  email: string | null
  reason: OutreachUnsubscribeReason | null
  comment: string | null
}

/** What the insert hands back: the row id and the time the database stamped. */
export type RecordedOutreachUnsubscribe = { id: string; created_at: string }

/**
 * The write, injected so the rule "a failed write throws" is tested without a
 * database. The caller passes
 * `(row) => admin.from('outreach_unsubscribes').insert(row).select('id, created_at').single()`.
 */
export type OutreachUnsubscribeInsert = (
  row: OutreachUnsubscribeRow,
) => PromiseLike<{ data: RecordedOutreachUnsubscribe | null; error: unknown }>

export class OutreachUnsubscribeNotRecorded extends Error {
  constructor(cause: unknown) {
    super('[outreach-unsubscribe] the unsubscribe could not be recorded; refusing to report it as done')
    this.name = 'OutreachUnsubscribeNotRecorded'
    this.cause = cause
  }
}

/**
 * Record one unsubscribe. THROWS on any failure, including an insert that
 * reports no error but hands back no row, because the only honest thing the
 * page can say about a write it cannot see is "try again".
 */
export async function recordOutreachUnsubscribe(
  insert: OutreachUnsubscribeInsert,
  value: OutreachUnsubscribeRecord,
): Promise<RecordedOutreachUnsubscribe> {
  let result: { data: RecordedOutreachUnsubscribe | null; error: unknown }
  try {
    result = await insert({
      hubspot_contact_id: value.hubspotContactId,
      email: value.email,
      reason: value.reason,
      comment: value.comment,
    })
  } catch (error) {
    console.error('[outreach-unsubscribe] insert threw:', error)
    throw new OutreachUnsubscribeNotRecorded(error)
  }
  if (result.error || !result.data?.id) {
    console.error('[outreach-unsubscribe] insert failed:', result.error ?? 'no row returned')
    throw new OutreachUnsubscribeNotRecorded(result.error ?? new Error('no row returned'))
  }
  return result.data
}

/** Who asked, in one line, for the subject and the body. */
function who(value: OutreachUnsubscribeRecord): string {
  return value.hubspotContactId !== null ? `HubSpot contact ${value.hubspotContactId}` : (value.email ?? 'unknown')
}

/** The time in Geelong, where the founder reads it, and in UTC for the record. */
function when(at: Date): string {
  const local = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(at)
  return `${local} Melbourne time (${at.toISOString()})`
}

/**
 * The one alert to the platform owner. Every value a stranger typed is escaped
 * before it reaches the HTML part.
 */
export function composeOutreachUnsubscribeAlert(
  value: OutreachUnsubscribeRecord,
  recorded: RecordedOutreachUnsubscribe,
): { subject: string; text: string; html: string } {
  const at = new Date(recorded.created_at)
  const identity = who(value)
  const reason = outreachReasonLabel(value.reason)
  const comment = value.comment ?? 'No comment'
  const deadline =
    'Stop emailing them now. ACMA requires an unsubscribe to be honoured within 5 working days.'

  const subject = `Outreach unsubscribe: ${identity}`
  const textBody = [
    'Somebody unsubscribed from your outreach emails.',
    '',
    value.hubspotContactId !== null ? `HubSpot contact id: ${value.hubspotContactId}` : `Email: ${value.email}`,
    `Reason: ${reason}`,
    `Comment: ${comment}`,
    `Time: ${when(at)}`,
    `Record: outreach_unsubscribes ${recorded.id}`,
    '',
    deadline,
  ].join('\n')

  const html = [
    '<p><strong>Somebody unsubscribed from your outreach emails.</strong></p>',
    '<p>',
    value.hubspotContactId !== null
      ? `HubSpot contact id: ${escapeHtml(value.hubspotContactId)}<br/>`
      : `Email: ${escapeHtml(value.email ?? '')}<br/>`,
    `Reason: ${escapeHtml(reason)}<br/>`,
    `Comment: ${escapeHtml(comment).replace(/\n/g, '<br/>')}<br/>`,
    `Time: ${escapeHtml(when(at))}<br/>`,
    `Record: outreach_unsubscribes ${escapeHtml(recorded.id)}`,
    '</p>',
    `<p>${escapeHtml(deadline)}</p>`,
  ].join('')

  return { subject, text: textBody, html }
}

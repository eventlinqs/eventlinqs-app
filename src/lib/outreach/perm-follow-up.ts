import { eventClock } from '@/lib/events/event-clock'
import { letterExpiry, type LetterEvent } from './event-validity'
import { STANDARD_SOURCE, lifecycleFields, type LifecycleFacts } from './lifecycle-letters'
import { REPLY_SIGNATURE, renderTemplate, type Rendered, type TemplateRow } from './rules'

/**
 * THE PERMISSION REQUEST'S ONE FOLLOW UP (Lawal, 20:45 of 22 November 2026: he adopted C:\dev\START-16OCT\
 * COMMS-STANDARD-REVIEW-22NOV.md, "A follow-up should remind the recipient of the outstanding action, not repeat the
 * original sales pitch"; the PM's 20:47, item 3: "ONE FOLLOW UP, APPROVED WORDING, sent only when the contact is
 * eligible, nothing is recorded (no reply, approval or decline) and the event is still ahead and relevant ... No
 * countdowns in any template; every date is computed from the record at send time").
 *
 * The template and the pure decision for one request: whether its follow up is drafted, and the draft. Wired as a
 * template and its drafting function only: no play's state or schedule changes here, and nothing is stored or sent.
 * The event's own clock (law 49, src/lib/events/event-clock.ts perm_follow_up) says when it may go: once, from T-17 and
 * at least four days after the request, never inside T-7; the event's record says it is still published and ahead
 * (./event-validity.ts letterExpiry, the send press's own rule). Silence is never permission: the follow up asks once
 * more and assumes nothing. It answers in the request's thread ("Re:"), signs as Lawal replies (no ABN block, as the
 * gateway's follow up category requires), and carries the unsubscribe line every email carries (Spam Act ss 17 and 18).
 *
 * Its class (PERM, PERM-REMINDER) is not yet in src/lib/comms/categories.ts TEMPLATE_CLASS: that map and the database's
 * comms_subtype_of_template_key are one map, changed together by a migration before this template is stored.
 */

export const PERM_FOLLOW_UP_KEY = 'lifecycle_perm_follow_up'

export interface PermFollowUpLetter extends TemplateRow {
  readonly key: typeof PERM_FOLLOW_UP_KEY
  readonly source: string
}

export const LIFECYCLE_PERM_FOLLOW_UP: PermFollowUpLetter = {
  key: PERM_FOLLOW_UP_KEY,
  channel: 'email',
  purpose: 'cadence',
  step: 2,
  subject: 'Re: Promoting [event] on EventLinqs',
  body: [
    'Hi [greeting],',
    'Just following up on our request to use the event image for [event] in our EventLinqs promotions.',
    "If you're happy for us to use it, you can confirm here: [approval link].",
    "Otherwise, no problem at all. We'll leave the image out.",
    'Thanks for your time.',
    `Kind regards,\n${REPLY_SIGNATURE}\n\n[unsubscribe]`,
  ].join('\n\n'),
  source: `${STANDARD_SOURCE} The PERM request's one follow up, the approved wording (item 3).`,
}

/** What the CRM records about one permission request and its contact, read when the follow up would be drafted. */
export interface PermRequestRecord {
  /** The contact may lawfully be written to: not unsubscribed, not suppressed, its consent basis held. */
  readonly eligible: boolean
  /** Any reply from them since the request. */
  readonly replied: boolean
  /** The image's use approved, with its evidence. */
  readonly approved: boolean
  /** Its use declined. */
  readonly declined: boolean
  /** When the request went; null while it has not. */
  readonly requestSentAt: string | null
  /** When its follow up went; there is one only. */
  readonly followUpSentAt: string | null
}

export type PermFollowUpDraft = { readonly state: 'drafted'; readonly letter: Rendered } | { readonly state: 'not drafted'; readonly why: string }

const notDrafted = (why: string): PermFollowUpDraft => ({ state: 'not drafted', why })

/**
 * The follow up for one request at `now`, or why there is none. A drafted letter may still be held by a CRM rule (a
 * field the records do not hold, such as the approval link): its heldBecause says so, and it is never sent while it does.
 */
export function draftPermFollowUp(input: {
  readonly facts: LifecycleFacts
  readonly record: PermRequestRecord
  readonly event: LetterEvent
  readonly unsubscribeUrl: string | null
  readonly now: Date
}): PermFollowUpDraft {
  const r = input.record
  if (!r.eligible) return notDrafted('the contact may not be written to: unsubscribed, suppressed or without a lawful basis')
  if (r.approved) return notDrafted('the image is approved, with its evidence: there is nothing to follow up')
  if (r.declined) return notDrafted('they declined: the image is left out and nothing more is asked')
  if (r.replied) return notDrafted('they have replied: the CRM answers them in their own thread, never with a follow up')
  if (!r.requestSentAt) return notDrafted('the request it follows has not gone')
  if (r.followUpSentAt) return notDrafted('one follow up only, and it has gone')
  const expired = letterExpiry(PERM_FOLLOW_UP_KEY, input.event, input.now)
  if (expired) return notDrafted(expired)
  const zone = input.event.timezone?.trim() || input.facts.night.timezone || 'Australia/Melbourne'
  const clock = eventClock(
    {
      startIso: input.event.startDate,
      endIso: input.event.endDate,
      foundIso: input.event.startDate,
      zone,
      // Only the asks are read here: what COMPLETE needs does not move a letter (as lifecycle-letters.ts reads the clock).
      picture: 'none',
      factsChecked: true,
      collabHandle: true,
      sellsTickets: false,
      ticketLink: true,
      organiserContact: true,
      granted: false,
      replied: false,
      sent: { perm: r.requestSentAt },
    },
    input.now,
  )
  if (!clock.due.includes('perm_follow_up')) {
    return notDrafted(`not due on the event's clock: once, from T-17 and four days after the request, never inside T-7 (the event is ${clock.daysToStart} day(s) away)`)
  }
  return { state: 'drafted', letter: renderTemplate(LIFECYCLE_PERM_FOLLOW_UP, lifecycleFields(input.facts), input.unsubscribeUrl) }
}

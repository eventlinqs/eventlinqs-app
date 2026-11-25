import { eventClock } from '@/lib/events/event-clock'
import { letterExpiry, type LetterEvent } from './event-validity'
import { STANDARD_SOURCE, lifecycleFields, type LifecycleFacts } from './lifecycle-letters'
import { REPLY_SIGNATURE, renderTemplate, type Rendered, type TemplateRow } from './rules'

/**
 * THE FREE PROMOTION OFFER'S ONE FOLLOW UP (law 49, "follow ups once"; the communication standard Lawal adopted on
 * 22 November 2026: "one appropriate follow-up"; activated by the PM's 12:11 of 25 November 2026, item 1, under Lawal's
 * standing rule of 12:10 that day, after its comparison with lifecycle_acq version 2, which already offers both the free
 * claim and selling tickets directly).
 *
 * The template and the pure decision for one offer, as ./perm-follow-up.ts is for the photo request: whether its follow
 * up is drafted, and the draft. The event's own clock (src/lib/events/event-clock.ts acq_follow_up) says when: once, from
 * T-14 and at least four days after the offer, never inside T-7; the event's record says it is still published and ahead
 * (./event-validity.ts letterExpiry). It answers in the offer's thread ("Re:" its subject, from the same mailbox, lawal@),
 * signs as Lawal replies (no ABN block, as the gateway's follow up category asks) and carries the unsubscribe line every
 * email carries (Spam Act ss 17 and 18). A reply, a stop or a yes ends the thread: nothing more is asked.
 */
export const ACQ_FOLLOW_UP_KEY = 'lifecycle_acq_follow_up'

export interface AcqFollowUpLetter extends TemplateRow {
  readonly key: typeof ACQ_FOLLOW_UP_KEY
  readonly source: string
}

export const LIFECYCLE_ACQ_FOLLOW_UP: AcqFollowUpLetter = {
  key: ACQ_FOLLOW_UP_KEY,
  channel: 'email',
  purpose: 'cadence',
  step: 2,
  // In the offer's own thread, whichever version of the offer it was (the subject it actually went with).
  subject: 'Re: [thread subject]',
  body: [
    'Hi [greeting],',
    'A quick follow up on [event] on [event day], listed on EventLinqs: [event link]',
    "If you'd like to claim the listing for free, keep its details up to date and sell tickets directly, just reply and I'll set it up.",
    `Kind regards,\n${REPLY_SIGNATURE}\n\n[unsubscribe]`,
  ].join('\n\n'),
  source: `${STANDARD_SOURCE} The ACQ offer's one follow up (law 49), activated by the PM's 12:11 of 25 November 2026, item 1.`,
}

/** What the CRM records about one offer and its contact, read when the follow up would be drafted. */
export interface AcqOfferRecord {
  /** The contact may lawfully be written to: not unsubscribed, not suppressed, its consent basis held. */
  readonly eligible: boolean
  /** Any reply from them since the offer (a yes, a no, a question or a stop all end the thread). */
  readonly replied: boolean
  /** When the offer went; null while it has not. */
  readonly offerSentAt: string | null
  /** When its follow up went or was queued; there is one only. */
  readonly followUpSentAt: string | null
}

export type AcqFollowUpDraft = { readonly state: 'drafted'; readonly letter: Rendered } | { readonly state: 'not drafted'; readonly why: string }

const notDrafted = (why: string): AcqFollowUpDraft => ({ state: 'not drafted', why })

/** The follow up for one offer at `now`, or why there is none. Pure. */
export function draftAcqFollowUp(input: {
  readonly facts: LifecycleFacts
  readonly record: AcqOfferRecord
  readonly event: LetterEvent
  readonly unsubscribeUrl: string | null
  /** The offer's own subject, as it went ('Re:' is added once by the template). */
  readonly threadSubject: string | null
  readonly now: Date
}): AcqFollowUpDraft {
  const r = input.record
  if (!r.eligible) return notDrafted('the contact may not be written to: unsubscribed, suppressed or without a lawful basis')
  if (r.replied) return notDrafted('they have replied: the CRM answers them in their own thread, never with a follow up')
  if (!r.offerSentAt) return notDrafted('the offer it follows has not gone')
  if (r.followUpSentAt) return notDrafted('one follow up only, and it has gone')
  const expired = letterExpiry(ACQ_FOLLOW_UP_KEY, input.event, input.now)
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
      granted: true,
      replied: false,
      sent: { acq: r.offerSentAt },
    },
    input.now,
  )
  if (!clock.due.includes('acq_follow_up')) {
    return notDrafted(`not due on the event's clock: once, from T-14 and four days after the offer, never inside T-7 (the event is ${clock.daysToStart} day(s) away)`)
  }
  const thread = (input.threadSubject ?? '').replace(/^(re:\s*)+/i, '').trim() || null
  return { state: 'drafted', letter: renderTemplate(LIFECYCLE_ACQ_FOLLOW_UP, { ...lifecycleFields(input.facts), 'thread subject': thread }, input.unsubscribeUrl) }
}

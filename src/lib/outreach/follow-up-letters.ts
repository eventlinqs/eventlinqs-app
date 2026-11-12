import type { TemplateRow } from './rules'
import { dayWords } from './twenty-letters'

/**
 * THE TWENTY'S DAY 4 LETTER (the PM's 19:12 of 12 November 2026: "Day 4: their night's own page on EventLinqs with its real
 * view count from the ledger (only if above zero; never a number the record does not hold) and their photo link ...
 * Lawal's format, no AI drafting spend, validated through gateway.py, held for his approval like the first letters").
 * Pure: ./follow-ups.ts reads the rows and drafts. COMMUNICATION-LAW-25OCT.md 4: a follow up brings something new, here the
 * night's own page and, where the ledger holds one, how many people have opened it; 5: no exit offered, the footer carries
 * the opt out. A follow up signs as Lawal replies (VOICE-EVENTLINQS.md: "Lawal Adams, Founder, EventLinqs", no ABN block),
 * in the first letter's thread ("Re:" and its subject), as gateway.py's follow_up category requires.
 */

export interface FollowUpLetter extends TemplateRow {
  readonly key: 'twenty_day4' | 'twenty_day10'
  readonly source: string
}

export const TWENTY_DAY4: FollowUpLetter = {
  key: 'twenty_day4',
  channel: 'email',
  purpose: 'cadence',
  step: 2,
  subject: 'Re: [thread subject]',
  body: [
    'Hi [greeting],',
    "I hope you're well. [night line]",
    "You can add your own photos to it here, and choose where they're used: [photo link]",
    'If you could change one thing about selling tickets for your events, what would it be?',
    "Even a one-line reply would help me build the right thing, and I'll write back to tell you what I did with it.",
    'Kind regards,',
    'Lawal Adams',
    'Founder, EventLinqs',
    '',
    '[unsubscribe]',
  ].join('\n'),
  source: "Lawal's format (VOICE-EVENTLINQS.md), the PM's 19:12 of 12 November 2026; samples in C:\\dev\\START-16OCT\\EL-FOLLOWUP-SAMPLES-12NOV.md",
}

/**
 * THE DAY 10 LETTER, way B of the PM's 19:56 (2): the night's own tracked link, no imagery, and the same one question,
 * until Lawal approves a photograph whole share card (way A, law 7). The link is the night's /e/ short link minted for
 * this letter, so every arrival through it is counted (share_link_events), and nothing is claimed about it that the link
 * does not do.
 */
export const TWENTY_DAY10: FollowUpLetter = {
  key: 'twenty_day10',
  channel: 'email',
  purpose: 'cadence',
  step: 3,
  subject: 'Re: [thread subject]',
  body: [
    'Hi [greeting],',
    "I hope you're well. Here's a link to [event] on [event day] that records how many people it brings, to share wherever you like: [tracked link]",
    'If you could change one thing about selling tickets for your events, what would it be?',
    "Even a one-line reply would help me build the right thing, and I'll write back to tell you what I did with it.",
    'Kind regards,',
    'Lawal Adams',
    'Founder, EventLinqs',
    '',
    '[unsubscribe]',
  ].join('\n'),
  source: "Lawal's format (VOICE-EVENTLINQS.md), the PM's 19:56 of 12 November 2026 (way B)",
}

export const FOLLOW_UP_LETTERS: readonly FollowUpLetter[] = [TWENTY_DAY4, TWENTY_DAY10]

/** The day 10 letter is due from the tenth Melbourne day after the FIRST letter was sent, once day 4 was sent. */
export const DAY10_AFTER_DAYS = 10

/** How many people have opened the night's page, said only when the ledger holds a number above zero. */
export function seenWords(viewers: number): string {
  if (!Number.isInteger(viewers) || viewers <= 0) return ''
  return viewers === 1 ? ', and one person has opened its page so far' : `, and ${viewers} people have opened its page so far`
}

/** "AJ's Trivia Night on Wednesday 18 November is listed on EventLinqs: <its page>", from the night's own row. */
export function nightLine(input: {
  readonly title: string
  readonly startDate: string
  readonly timezone: string | null
  readonly slug: string
  readonly viewers: number
  readonly origin: string
}): string {
  return `${input.title.trim()} on ${dayWords(input.startDate, input.timezone)} is listed on EventLinqs${seenWords(input.viewers)}: ${input.origin.replace(/\/+$/, '')}/events/${input.slug}`
}

/** The day 4 letter is due from the fourth Melbourne day after the first letter was sent. */
export const DAY4_AFTER_DAYS = 4

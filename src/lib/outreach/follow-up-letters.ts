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
  readonly key: 'twenty_day4'
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

export const FOLLOW_UP_LETTERS: readonly FollowUpLetter[] = [TWENTY_DAY4]

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

import { FOUNDING_INITIAL_MONTHS_WORD } from '@/lib/payments/founding-waiver'
import type { TemplateRow } from './rules'

/**
 * TOMORROW'S TWENTY, IN LAWAL'S OWN OCTOBER FORMAT, WITHOUT THE API (the PM, 12 November 2026, 11:58, item 2: "Lawal
 * has not approved Claude API drafting spend ... Tomorrow's twenty are drafted WITHOUT the API: fill his own October
 * format ('Hi <name or team>,' / one true, specific line about their event / who he is and what EventLinqs is / the ask /
 * his signature) from verified CRM facts, through the gateway's checks. Template the opening line from the event's own
 * verified facts; never invent. The API drafting option stays built and switched off until he says yes himself").
 *
 * The words are his, from his sent mail of 10 and 11 October, save one: "ticketing" is left out of "a new Australian
 * ticketing platform", by the owner's positioning ruling of 7 September 2026 (scripts/guards/positioning-lock.mjs:
 * EventLinqs is the platform where events get made, never a ticketing platform) (C:\dev\START-16OCT\VOICE-EVENTLINQS.md: the greeting,
 * "I hope you're well.", "I'm Lawal Adams, and I'm building EventLinqs, a new Australian ticketing platform that builds
 * a community around every event it lists.", the one question, "Even a one-line reply would help me build the right
 * thing, and I'll write back to tell you what I did with it.") and, for a conversion ask, from his own first message to
 * Victoria Chorale of 4 October (a small allocation alongside how they sell now, the months with no platform fee, the
 * full face value, the look at /organisers). The one line about their event is the only line made from their row: the
 * night's own title, day and place, and the fact that it is listed on EventLinqs. Nothing in it is a compliment that
 * could fit anyone, and nothing is invented: a field with no verified value stays unfilled and the draft is held.
 *
 * Stored as outreach_templates rows, versioned (never edited): ./twenty-drafts.ts writes the next version whenever these
 * words change. Pure.
 */

export type TwentyLetterKey = 'twenty_advice' | 'twenty_offer'

export interface TwentyLetter extends TemplateRow {
  readonly key: TwentyLetterKey
  readonly source: string
}

const CLOSE = ['Kind regards,', '[signature]', '', '[unsubscribe]']

export const TWENTY_ADVICE: TwentyLetter = {
  key: 'twenty_advice',
  channel: 'email',
  purpose: 'cadence',
  step: 1,
  subject: '[event], could I ask your advice?',
  body: [
    'Hi [greeting],',
    "I hope you're well. [event] on [event day] at [event place] is already listed on EventLinqs.",
    "I'm Lawal Adams, and I'm building EventLinqs, a new Australian platform that builds a community around every event it lists. I'm not writing to ask you to change how you sell tickets. You've been running events far longer than I have, and I'd love to learn from that.",
    'If you could change one thing about selling tickets, what would it be?',
    "Even a one-line reply would help me build the right thing, and I'll write back to tell you what I did with it.",
    ...CLOSE,
  ].join('\n'),
  source: "Lawal's first messages of 10 and 11 October 2026 (VOICE-EVENTLINQS.md), templated on the PM's 11:58 of 12 November",
}

export const TWENTY_OFFER: TwentyLetter = {
  key: 'twenty_offer',
  channel: 'email',
  purpose: 'cadence',
  step: 1,
  subject: '[event], could I ask your advice?',
  body: [
    'Hi [greeting],',
    "I hope you're well. [event] on [event day] at [event place] is already listed on EventLinqs.",
    "I'm Lawal Adams, and I'm building EventLinqs, a new Australian platform that builds a community around every event it lists.",
    "You could start with a small allocation of tickets alongside how you sell now. There's [offer], and you keep the full face value of every ticket sold.",
    'Would you be open to having a look at https://www.eventlinqs.com.au/organisers and telling me what you think?',
    ...CLOSE,
  ].join('\n'),
  source: "Lawal's first message to Victoria Chorale of 4 October 2026, templated on the PM's 11:58 of 12 November",
}

export const TWENTY_LETTERS: readonly TwentyLetter[] = [TWENTY_ADVICE, TWENTY_OFFER]

/** The offer, from the one offer module (LAW 24; offer-is-one-rule): never typed here. */
export const OFFER_WORDS = `no platform fee for your first ${FOUNDING_INITIAL_MONTHS_WORD} months, counted from the day you register`

/** A public night of theirs, as the template names it. */
export interface TheirNight {
  readonly title: string
  readonly startDate: string
  readonly timezone: string | null
  readonly venueName: string | null
  readonly isFree: boolean | null
}

/** "Saturday 5 December", in the night's own time zone (Melbourne where the row names none). */
export function dayWords(iso: string, timezone: string | null): string {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone || 'Australia/Melbourne' }).format(new Date(iso))
}

/**
 * The fields for one organiser's letter, from their own rows: the greeting is the contact's first name, or the
 * organisation's team where no person is named (as touch-voice.ts reads it back for the gateway).
 */
export function letterFields(input: { readonly organiserName: string; readonly personName: string | null; readonly night: TheirNight }): Record<string, string | null> {
  const first = (input.personName ?? '').trim().split(/\s+/)[0] ?? ''
  const organiser = input.organiserName.trim()
  return {
    greeting: first || (organiser ? `${organiser} team` : null),
    event: input.night.title.trim() || null,
    'event day': dayWords(input.night.startDate, input.night.timezone),
    'event place': input.night.venueName?.trim() || null,
    offer: OFFER_WORDS,
  }
}

/** A conversion ask carries the offer only where the night is sold by ticket; a free night is asked for advice. */
export function letterFor(group: string, night: TheirNight): TwentyLetter {
  return group === 'conversion' && night.isFree === false ? TWENTY_OFFER : TWENTY_ADVICE
}

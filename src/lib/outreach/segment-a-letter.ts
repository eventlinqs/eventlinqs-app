import type { TemplateRow } from './rules'
import { seenWords } from './follow-up-letters'
import { dayWords } from './twenty-letters'

/**
 * SEGMENT A: ORGANISERS WHOSE EVENTS ARE ALREADY LISTED (the PM's 02:00 of 18 November 2026, item 2; the text,
 * C:/dev/EVIDENCE/EL-18NOV/outreach/SEGMENT-A-LETTER-PM-0200.md, under EL-COMMS-STANDARD-LOCKED-17NOV.md). One letter per
 * organiser, led by their real numbers, with one action: one image, by reply or their secure photo link. The day 4 and day
 * 10 letters are standard-v1's msg-2 and msg-3 (C:/dev/EVIDENCE/EL-17NOV/outreach/standard-v1), each naming their next
 * night and sent only while it is 3 or more days ahead.
 *
 * The words are the PM's, save where production's own rows of 18 November showed they would state something untrue; each
 * departure is a rule here, not an edit by hand:
 *   - SENT is never stated: the outbound presses (2,013 rows, 1,801 distinct hashes, bursts of 217, 236 and 331 a day)
 *     outnumber the page views (701) and are not proved to count people, so the subject without SENT is used;
 *   - one listed event, one person: the singular;
 *   - no booking page on their listed events: no booking words; some without one: 'each' is left out;
 *   - 'show' only for music, comedy and theatre, 'event' otherwise (a market is not a show);
 *   - an all capitals title in title case, and a plural's possessive with its apostrophe ('Mens' reads "Men's");
 *   - 'a new Australian platform', without 'ticketing', by Lawal's positioning ruling of 7 September 2026
 *     (scripts/guards/positioning-lock.mjs), as the twenty letters already write it.
 * Stored as outreach_templates rows, versioned and never edited (./twenty-drafts.ts storeLetters). Pure.
 */

export type SegmentAKey = 'segment_a_first' | 'segment_a_day4' | 'segment_a_day10'

export interface SegmentALetter extends TemplateRow {
  readonly key: SegmentAKey
  readonly source: string
}

const P = (...paragraphs: string[]) => paragraphs.join('\n\n')
const SOURCE = "The PM's 02:00 of 18 November 2026 (SEGMENT-A-LETTER-PM-0200.md), under the communication standard of 17 November 2026"

export const SEGMENT_A_FIRST: SegmentALetter = {
  key: 'segment_a_first',
  channel: 'email',
  purpose: 'cadence',
  step: 1,
  subject: 'Helping more people find [event] on [event date]',
  body: [
    P(
      'Hi [greeting],',
      "I hope you're well.",
      '[listed line]',
      "I'm Lawal Adams, and I'm building EventLinqs, a new Australian platform that builds a community around every event it lists. I'd love to help more people find [event] on [event day]: [event link]",
      '[image line]',
      'Could you reply with one image, or add it here? [photo link]',
    ),
    'Kind regards,\n[signature]\n\n[unsubscribe]',
  ].join('\n\n'),
  source: SOURCE,
}

const REPLY_CLOSE = 'Kind regards,\nLawal Adams\nFounder, EventLinqs\n\n[unsubscribe]'

export const SEGMENT_A_DAY4: SegmentALetter = {
  key: 'segment_a_day4',
  channel: 'email',
  purpose: 'cadence',
  step: 2,
  subject: 'Re: [thread subject]',
  body: [P('Hi [greeting],', "I hope you're well.", '[night line]', '[photo why line]', 'Reply with one image, or add it here: [photo link]'), REPLY_CLOSE].join('\n\n'),
  source: `${SOURCE}; standard-v1 msg-2`,
}

export const SEGMENT_A_DAY10: SegmentALetter = {
  key: 'segment_a_day10',
  channel: 'email',
  purpose: 'cadence',
  step: 3,
  subject: 'Re: [thread subject]',
  body: [P('Hi [greeting],', "I hope you're well.", 'A quick note on [event] on [event day]. [still line]', "Here's the listing: [event link]"), REPLY_CLOSE].join('\n\n'),
  source: `${SOURCE}; standard-v1 msg-3`,
}

export const SEGMENT_A_LETTERS: readonly SegmentALetter[] = [SEGMENT_A_FIRST, SEGMENT_A_DAY4, SEGMENT_A_DAY10]

/** Their next night, as the letter names it. */
export interface SegmentANight {
  readonly title: string
  readonly slug: string
  readonly startDate: string
  readonly timezone: string | null
  readonly categorySlug: string | null
  /** Its listing shows a photograph. */
  readonly hasPhoto: boolean
  /** It has a button to their own booking page (an external ticket link or a booking link). */
  readonly hasBooking: boolean
}

/** Every fact a segment A letter states, each read from production when the letter is drafted (./segment-a-read.ts). */
export interface SegmentAFacts {
  readonly organiserName: string
  readonly personName: string | null
  readonly night: SegmentANight
  /** Their public events listed now, and how many of those have a booking page. */
  readonly listedNow: number
  readonly listedWithBooking: number
  /** Distinct people who opened any of their events' pages (the page view key read one way, src/lib/growth/page-view-key.ts). */
  readonly openers: number
  /** Distinct people who opened this night's own page (day 4); absent where not read. */
  readonly nightOpeners?: number
  /** Their secure photo link, whole; null leaves the draft held. */
  readonly photoLink: string | null
  readonly origin: string
}

const SHOW_CATEGORIES: ReadonlySet<string> = new Set(['music', 'comedy', 'theatre', 'arts-community'])

/** A title as a letter writes it: title case for one written all in capitals, and a plural's possessive with its apostrophe. */
export function letterTitle(title: string): string {
  let t = title.replace(/\s+/g, ' ').trim()
  if (/[A-Z]{2}/.test(t) && t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|[\s(:'"&/-])([a-z])/g, (_m, b: string, c: string) => `${b}${c.toUpperCase()}`)
  return t.replace(/\b(Men|Women|Children)s\b/g, (_m: string, who: string) => `${who}'s`)
}

/** The local day (YYYY-MM-DD) an instant falls on, in the night's own zone (Melbourne where none is named). */
export function melbourneDayOf(iso: string, timezone: string | null = null): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

/** The standard's timing rule (Part 2 rule 4): a night is named only when it starts 3 or more days after the letter lands. */
export const SEGMENT_A_DAYS_AHEAD = 3

export function isSegmentANight(startIso: string, landsOn: string, timezone: string | null = null): boolean {
  const first = new Date(Date.parse(`${landsOn}T12:00:00Z`) + SEGMENT_A_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10)
  return melbourneDayOf(startIso, timezone) >= first
}

const people = (n: number, tail: string) => (n === 1 ? `one person has ${tail}` : `${n} people have ${tail}`)

/** Every field the three letters fill, from the facts; a fact we do not hold stays unfilled, so the draft is held. */
export function segmentAFields(f: SegmentAFacts): Record<string, string | null> {
  const first = (f.personName ?? '').trim().split(/\s+/)[0] ?? ''
  const organiser = f.organiserName.trim()
  const event = letterTitle(f.night.title) || null
  const one = f.listedNow === 1
  const everyBooked = f.listedNow > 0 && f.listedWithBooking === f.listedNow
  const someBooked = f.listedWithBooking > 0
  const listing = one
    ? `Your event is already listed on EventLinqs at no cost to you${everyBooked ? ', with a button straight to your own booking page' : ''}.`
    : `Your events are already listed on EventLinqs at no cost to you${everyBooked ? ', each with a button straight to your own booking page' : someBooked ? ', with a button straight to your own booking page' : ''}.`
  const opened = f.openers > 0 ? ` So far ${people(f.openers, `opened ${one ? 'your event pages' : 'their pages'} on EventLinqs`)}.` : ''
  const kind = SHOW_CATEGORIES.has(f.night.categorySlug ?? '') ? 'show' : 'event'
  const tickets = f.night.hasBooking ? ' Your tickets stay exactly where they are.' : ''
  const image = f.night.hasPhoto
    ? `Send me one image of your next ${kind} you're happy for us to use, and I'll add it for you.${tickets}`
    : `Right now its listing has no photo. A real photo of the ${kind} gives people browsing the guide a reason to stop and click through${f.night.hasBooking ? ' to your tickets' : ''}. Send me one image you're happy for us to use and I'll add it for you.${tickets}`
  const link = f.night.slug ? `${f.origin.replace(/\/+$/, '')}/events/${f.night.slug}` : null
  const day = dayWords(f.night.startDate, f.night.timezone)
  const date = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', timeZone: f.night.timezone || 'Australia/Melbourne' }).format(new Date(f.night.startDate))
  return {
    greeting: first || (organiser ? `${organiser} team` : null),
    event,
    'event day': day,
    'event date': date,
    'event link': link,
    'listed line': listing + opened,
    'image line': image,
    'photo link': f.photoLink,
    'night line': event && link ? `${event} on ${day} is listed on EventLinqs${seenWords(f.nightOpeners ?? 0)}: ${link}` : null,
    'photo why line': `A photo would give the people finding it a real picture of the ${kind}${f.night.hasBooking ? ', and more reason to click through to your tickets' : ''}. Send me one image you're happy for us to use and I'll add it for you.`,
    'still line': `I'd still love to help more people find it while it's coming up: send me one image you're happy for us to use and I'll add it to the listing for you${f.night.hasBooking ? ', with your tickets staying exactly where they are' : ''}.`,
  }
}

import type { TemplateRow } from './rules'
import { nightKind, type NightKind } from '@/lib/social/campaign'
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
      // "Hi <name>," then straight into the purpose: no stock pleasantry (Lawal, 20:45 of 22 November 2026, adopting
      // COMMS-STANDARD-REVIEW-22NOV.md, "change everything, even the greetings"; the PM's 20:47, item 1).
      'Hi [greeting],',
      '[listed line]',
      // VERSION 2, today-v2's own words (Lawal's APPROVE PERM of 18 November 2026, 13:46; the PM's 20:40 of 19 November):
      // version 1's founder sentence is out of every message (Lawal, 18 November 2026, 11:31). Version 1 stays stored, retired.
      "We'd love to help more people discover [event] on [event day]: [event link]",
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
  body: [P('Hi [greeting],', '[night line]', '[photo why line]', 'Reply with one image, or add it here: [photo link]'), REPLY_CLOSE].join('\n\n'),
  source: `${SOURCE}; standard-v1 msg-2`,
}

export const SEGMENT_A_DAY10: SegmentALetter = {
  key: 'segment_a_day10',
  channel: 'email',
  purpose: 'cadence',
  step: 3,
  subject: 'Re: [thread subject]',
  body: [P('Hi [greeting],', 'A quick note on [event] on [event day]. [still line]', "Here's the listing: [event link]"), REPLY_CLOSE].join('\n\n'),
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
  /** The night's own words and venue, for the one kind reader the posts use (campaign.ts nightKind). */
  readonly summary?: string | null
  readonly venueName?: string | null
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

// 'show' only for a gig, jazz, classical, comedy, theatre or dance night (the PM's 03:10 of 18 November 2026, class 14),
// read by the ONE kind reader the posts use (campaign.ts nightKind), never the raw category (the PM's 04:38: 'An Evening
// with Alastair Campbell' is listed as music and is a talk; Cosi is listed as arts-community and is a play).
const SHOW_KINDS: ReadonlySet<NightKind> = new Set<NightKind>(['gig', 'jazz', 'classical', 'comedy', 'theatre', 'dance'])

/** The night's kind as the posts read it. */
export function kindOfNight(n: SegmentANight): NightKind | null {
  return nightKind({ title: n.title, sourceTitle: n.title, summary: n.summary ?? null, venueName: n.venueName ?? null, host: n.venueName ?? null, categorySlug: n.categorySlug, startDate: n.startDate, timezone: n.timezone })
}

/**
 * NO COUNT OF PEOPLE UNTIL IT IS PROVED TO COUNT PEOPLE (the PM's 02:38 of 18 November 2026, items 2 and 3). The page view
 * record refuses crawlers and headless browsers (src/lib/broadcast/crawler.ts) and keys a visitor by address and browser,
 * one row a day, but it cannot tell our own real browser visits (Lawal on his own listings, a walk in a real browser, an
 * admin session on a public page) from the public, so no letter states it; below 5 it would never be stated anyway.
 */
export const OPENERS_PROVED = false
const OPENERS_FLOOR = 5

/**
 * THE GREETING NAMES THE ORGANISATION, as it would sign itself (the PM's 03:10, classes 11 and 12): a person's first name
 * where one is named, else the organisation without a leading 'The', a bracketed part or an 'at <venue>' tail, and 'team'.
 */
export function greetingOf(organiserName: string, personName: string | null): string {
  const first = (personName ?? '').trim().split(/\s+/)[0] ?? ''
  if (first) return first
  const name = organiserName
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s+at\s+.+$/i, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `${name} team`
}

/**
 * THE ADDRESS BELONGS TO THE ORGANISATION THE GREETING NAMES (the PM's 03:10, class 10: 'Bendigo Foodshare team' at
 * manager@bcfm.org.au, the Bendigo Community Farmers Market). True when the address's own name or its domain holds a word
 * of the organisation's name (three letters or more), or the initials of its main words; otherwise the letter is held.
 */
export function addressFitsName(address: string, organiserName: string): boolean {
  const [local, domain] = address.toLowerCase().split('@')
  if (!domain) return false
  const label = domain.split('.')[0] ?? ''
  const words = organiserName
    .replace(/\([^)]*\)/g, ' ')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['the', 'and', 'for', 'with'].includes(w))
  const initials = organiserName
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w) && !['The', 'Of', 'And'].includes(w))
    .map((w) => w[0].toLowerCase())
    .join('')
  return words.some((w) => label.includes(w) || local.includes(w)) || (initials.length >= 2 && label.startsWith(initials))
}

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
  const title = letterTitle(f.night.title)
  // A billing set in capitals is their night, not a name (the PM's 03:10, class 13): 'your Professional Comedians night'.
  const billing = /[A-Z]{2}/.test(f.night.title) && f.night.title === f.night.title.toUpperCase()
  const evening = Number(new Intl.DateTimeFormat('en-AU', { timeZone: f.night.timezone || 'Australia/Melbourne', hour: 'numeric', hourCycle: 'h23' }).format(new Date(f.night.startDate))) >= 17
  const event = title ? (billing ? `your ${title} ${evening ? 'night' : 'session'}` : title) : null
  const one = f.listedNow === 1
  const everyBooked = f.listedNow > 0 && f.listedWithBooking === f.listedNow
  const someBooked = f.listedWithBooking > 0
  const listing = one
    ? `Your event is already listed on EventLinqs at no cost to you${everyBooked ? ', with a button straight to your own booking page' : ''}.`
    : `Your events are already listed on EventLinqs at no cost to you${everyBooked ? ', each with a button straight to your own booking page' : someBooked ? ', with a button straight to your own booking page' : ''}.`
  // Stated only once proved to count people, and never below 5 (OPENERS_PROVED): 'your event pages', or 'its page' for one.
  const opened = OPENERS_PROVED && f.openers >= OPENERS_FLOOR ? ` So far ${people(f.openers, `opened ${one ? 'its page' : 'your event pages'} on EventLinqs`)}.` : ''
  const read = kindOfNight(f.night)
  const kind = read !== null && SHOW_KINDS.has(read) ? 'show' : 'event'
  const tickets = f.night.hasBooking ? ' Your tickets stay exactly where they are.' : ''
  const image = f.night.hasPhoto
    ? `Send us one image of your next ${kind} you're happy for us to use, and we'll add it for you.${tickets}`
    : `Right now its listing has no photo. A real photo of the ${kind} gives people browsing the guide a reason to stop and click through${f.night.hasBooking ? ' to your tickets' : ''}. Send me one image you're happy for us to use and I'll add it for you.${tickets}`
  const link = f.night.slug ? `${f.origin.replace(/\/+$/, '')}/events/${f.night.slug}` : null
  const day = dayWords(f.night.startDate, f.night.timezone)
  const date = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', timeZone: f.night.timezone || 'Australia/Melbourne' }).format(new Date(f.night.startDate))
  return {
    greeting: f.organiserName.trim() || f.personName ? greetingOf(f.organiserName, f.personName) : null,
    event,
    'event day': day,
    'event date': date,
    'event link': link,
    'listed line': listing + opened,
    'image line': image,
    'photo link': f.photoLink,
    'night line': event && link ? `${event.charAt(0).toUpperCase()}${event.slice(1)} on ${day} is listed on EventLinqs${OPENERS_PROVED && (f.nightOpeners ?? 0) >= OPENERS_FLOOR ? seenWords(f.nightOpeners ?? 0) : ''}: ${link}` : null,
    'photo why line': `A photo would give the people finding it a real picture of the ${kind}${f.night.hasBooking ? ', and more reason to click through to your tickets' : ''}. Send me one image you're happy for us to use and I'll add it for you.`,
    'still line': `I'd still love to help more people find it while it's coming up: send me one image you're happy for us to use and I'll add it to the listing for you${f.night.hasBooking ? ', with your tickets staying exactly where they are' : ''}.`,
  }
}

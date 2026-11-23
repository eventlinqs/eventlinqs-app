import { COMPLETE_BY, eventClock, type ClockStep } from '@/lib/events/event-clock'
import { CITY_NAMES } from '@/lib/cities/city-names'
import { PROVIDER_NAMES, providerOf } from '@/lib/events/booking-links'
import type { TemplateRow } from './rules'
import { onOwnHost, ownHost } from './own-host'
import { dayWords } from './twenty-letters'
import { greetingOf, letterTitle } from './segment-a-letter'

/**
 * LAW 49'S TWO LETTERS, ON EACH EVENT'S CLOCK (Lawal, 21 November 2026, 09:20, C:\dev\START-16OCT\
 * EVENT-LIFECYCLE-ENGINE-LOCKED-21NOV.md section 2): PERM, one photo permission request from hello@, from T-28; ACQ, the
 * free promotion offer from lawal@, from T-21, never in the same letter (law 24). Each is a play's first letter
 * (outreach_plays), its words stored once as an outreach_templates row and never edited (./twenty-drafts.ts storeLetters).
 *
 * THE WORDS. The PM's 09:23 drafts of 21 November 2026, rewritten around the event's clock on Lawal's 09:23 ("the offer
 * becomes very easy to sell when you can show people the event, like, 'Hey, it's almost 2 weeks to the event'"), as
 * fixed through the gateway (the PM's 10:15 ruling 7: 'show it properly', and the second paragraph naming only where the
 * record shows the night appeared) and validated with a real upcoming night (C:\dev\EVIDENCE\EL-21NOV\law49, r2). Lawal's
 * go on the wording, 09:25, quoted, not interpreted: "Yep, good work. We can perfect everything later. Good work, just
 * finish it up." PERM adds one sentence, the organiser's one tap photo link (the PM's 13:01 of 21 November 2026, item 3:
 * "sending in its own window, with the one tap upload, so organisers' own photographs replace the stand ins"). Its last
 * paragraph departs from r2 by three words, each by a rule, not by hand: the CRM rule that "you and your outnumber we
 * and our" (./rules.ts; r2 read 5 to 7 and every draft would have been held) takes 'your listing' for 'this listing'
 * and 'If you'd rather use' for 'If you'd rather we used', and the one tap link stands where 'and we'll use that one' was.
 *
 * VERSION 2, THE COMMUNICATION STANDARD (Lawal, 20:45 of 22 November 2026: he adopted C:\dev\START-16OCT\
 * COMMS-STANDARD-REVIEW-22NOV.md, "follow this A to Z", "change everything, even the greetings"; the PM's 20:47, items 1 to
 * 4). PERM is the approved permission request word for word, personalised only from the records: the event, the
 * organiser's team, the city, the day and date, the page its image is on, and the approval link. No claim link and no
 * "listed free": the claim invitation is its own letter in the acquisition flow (item 4). No stock pleasantry in either
 * letter, and no countdown: ACQ's subject names the night's day and date as the record holds it ("on Saturday 12
 * December"), never "[days] days to". Its one follow up is ./perm-follow-up.ts. Version 1 stays stored, retired.
 *
 * THE APPROVAL LINK IS THE ORGANISER'S OWN PHOTO PAGE (Lawal, 13:49 of 23 November 2026: "One tick, they read through
 * everything ... One tick, one checkbox ... We are just promoting the event"): /photos/<contact>/<proof>, the proof derived
 * from the unsubscribe token of the contact written to (./photo-link.ts photoProof), filled by the reader
 * (./lifecycle-read.ts) into LifecycleFacts.approvalLink. A contact with no token has no link: [approval link] stays
 * unfilled and the PERM draft is held for it, never sent with a stand in.
 *
 * THE CLOCK DECIDES. lifecycleChoice asks the event clock (src/lib/events/event-clock.ts) whether the play's step is due
 * on one of the organiser's nights today: never inside T-7, never on or after the night. Pure.
 */

export type LifecycleKey = 'lifecycle_perm' | 'lifecycle_acq'

export interface LifecycleLetter extends TemplateRow {
  readonly key: LifecycleKey
  readonly source: string
}

/** The clock's step each letter is, and the class it takes (law 24; src/lib/comms/categories.ts holds the same). */
export const LIFECYCLE_STEP: Readonly<Record<LifecycleKey, ClockStep>> = { lifecycle_perm: 'perm_request', lifecycle_acq: 'acq_offer' }
export const LIFECYCLE_SUBTYPE: Readonly<Record<LifecycleKey, string>> = { lifecycle_perm: 'PERM-IMAGE', lifecycle_acq: 'ACQ-FIRST' }

export function isLifecycleKey(key: string | null | undefined): key is LifecycleKey {
  return key === 'lifecycle_perm' || key === 'lifecycle_acq'
}

const P = (...paragraphs: string[]) => paragraphs.join('\n\n')
const CLOSE = 'Kind regards,\n[signature]\n\n[unsubscribe]'
const SOURCE =
  "The PM's 09:23 drafts of 21 November 2026 as fixed through the gateway (the PM's 10:15 ruling 7; C:/dev/EVIDENCE/EL-21NOV/law49 r2), Lawal's go on the wording at 09:25: 'Yep, good work. We can perfect everything later. Good work, just finish it up.'"
/** Where version 2's words come from: Lawal's adopted review of 20:45, 22 November 2026, and the PM's 20:47 order. */
export const STANDARD_SOURCE =
  "The communication standard: Lawal adopted C:/dev/START-16OCT/COMMS-STANDARD-REVIEW-22NOV.md at 20:45 of 22 November 2026 ('follow this A to Z', 'change everything, even the greetings'); the PM's 20:47 order, items 1 to 4."

export const LIFECYCLE_PERM: LifecycleLetter = {
  key: 'lifecycle_perm',
  channel: 'email',
  purpose: 'cadence',
  step: 1,
  subject: 'Promoting [event] on EventLinqs',
  body: [
    P(
      'Hi [greeting],',
      "We're featuring upcoming [city] events on EventLinqs and have included [event] on [event day].",
      "We'd love to help more people discover the event through our Instagram, Facebook, and upcoming event guides.",
      // The approved words say "on your website"; the page is named from the record, so an image on a ticketing
      // platform's page is never said to be on their website (no fact the record does not hold).
      'Could you please confirm whether we have permission to use the event image displayed on [photo source] for this promotion?',
      'You can review the image and approve its use here: [approval link].',
      'If another party owns the image, please let us know so we can contact the appropriate rights holder.',
      'Thanks for your time.',
    ),
    CLOSE,
  ].join('\n\n'),
  source: `${STANDARD_SOURCE} PERM lifecycle v2, the approved permission request (item 2), with the legally required sender details and opt out unchanged. Earlier: ${SOURCE}`,
}

export const LIFECYCLE_ACQ: LifecycleLetter = {
  key: 'lifecycle_acq',
  channel: 'email',
  purpose: 'cadence',
  step: 1,
  subject: "[event] on [event day]: let's fill it",
  body: [
    P(
      'Hi [greeting],',
      "I'm Lawal, founder of EventLinqs, the what's on guide for [city]. [event] on [event day] is already listed with us: [event link]",
      'Over its last two weeks we put it in front of people looking for something to do in [city], on the [city] guide.',
      "If you'd like more from it, you can claim the listing for free, keep the details up to date yourself and sell tickets directly, with every attendee's details yours to keep.",
      'Would you like me to set that up for you?',
    ),
    CLOSE,
  ].join('\n\n'),
  source: `${STANDARD_SOURCE} ACQ lifecycle v2: no stock pleasantry, and the night's day and date in place of the countdown. Earlier: ${SOURCE}`,
}

export const LIFECYCLE_LETTERS: readonly LifecycleLetter[] = [LIFECYCLE_PERM, LIFECYCLE_ACQ]

/**
 * How the letter names the page its photograph is on: 'your Humanitix page' for a ticketing platform, by the one table of
 * platform names (src/lib/events/booking-links.ts PROVIDER_NAMES, the only file that may spell them), or 'your website'
 * for the organiser's own host. A page we cannot name is null, so the draft is held rather than guessed at.
 */
export function photoSourceWords(bookingUrl: string | null | undefined, websiteUrl: string | null | undefined): string | null {
  if (!bookingUrl) return null
  const platform = PROVIDER_NAMES[providerOf(bookingUrl)]
  if (platform) return `your ${platform} page`
  const own = ownHost(websiteUrl)
  return own && onOwnHost(bookingUrl, own) ? 'your website' : null
}

/** The night a lifecycle letter names, as read from production when it is drafted. */
export interface LifecycleNight {
  readonly title: string
  readonly slug: string
  readonly startDate: string
  readonly timezone: string | null
  readonly citySlug: string | null
  /** Its booking page: its own ticket link, else its first booking link. */
  readonly bookingUrl: string | null
}

export interface LifecycleFacts {
  readonly organiserName: string
  readonly personName: string | null
  readonly websiteUrl: string | null
  readonly night: LifecycleNight
  /** Their secure photo link, whole (./photo-link.ts): the upload page, which version 1 of PERM named. */
  readonly photoLink: string | null
  /**
   * THE APPROVAL LINK the approved permission request names ("You can review the image and approve its use here"): the
   * organiser's own photo page, where one tick records the grant (Lawal, 13:49 of 23 November 2026), built from the
   * contact's token by ./photo-link.ts. Absent or null (a contact with no token), [approval link] stays unfilled and the
   * PERM draft is held.
   */
  readonly approvalLink?: string | null
  readonly origin: string
}

const cityName = (slug: string | null): string | null => CITY_NAMES.find(([s]) => s === slug)?.[1] ?? null

/**
 * Days to go, counted as the clock counts them: calendar days from today to the night's first day, in its own zone. The
 * clock's own count, for when a letter may go (lifecycleStillAsks); never written into a letter (no countdowns).
 */
export function daysToGo(startIso: string, zone: string | null, now: Date): number {
  return lifecycleClock({ eventId: '', startIso, endIso: null, zone: zone || 'Australia/Melbourne', granted: false }, false, now).daysToStart
}

/**
 * Every field the letters fill, from the facts; a fact we do not hold stays unfilled, so the draft is held. Every date is
 * the night's own day and date, read from its record in its own zone ("Saturday 12 December"), never a count of days.
 */
export function lifecycleFields(f: LifecycleFacts): Record<string, string | null> {
  const title = letterTitle(f.night.title)
  return {
    greeting: f.organiserName.trim() || f.personName ? greetingOf(f.organiserName, f.personName) : null,
    event: title ? `${title.charAt(0).toUpperCase()}${title.slice(1)}` : null,
    'event day': dayWords(f.night.startDate, f.night.timezone),
    'event link': f.night.slug ? `${f.origin.replace(/\/+$/, '')}/events/${f.night.slug}` : null,
    city: cityName(f.night.citySlug),
    'photo source': photoSourceWords(f.night.bookingUrl, f.websiteUrl),
    'approval link': f.approvalLink?.trim() || null,
  }
}

/* ------------------------------------------------------------------ which night, and whether today */

/** One of the organiser's public nights, as the clock reads it. */
export interface LifecycleNightClock {
  readonly eventId: string
  readonly startIso: string
  readonly endIso: string | null
  readonly zone: string
  /**
   * Its cover is the organiser's own photograph with recorded rights (organiser_authorised or separately_licensed), or
   * they already gave us images for it (a current organiser authorised asset): either way they are never asked again.
   */
  readonly granted: boolean
}

export interface LifecycleOrganiserRecord {
  /** Any reply from them: the CRM answers them in their own thread, never with a cold letter (one-first-letter.ts). */
  readonly replied: boolean
  /** A letter of this kind already went or is going to them (queued, sending or sent, any play), or this play's own is held. */
  readonly alreadyAsked: boolean
  /** Their public nights ahead, soonest first. */
  readonly nights: readonly LifecycleNightClock[]
}

export type LifecycleChoice =
  | { readonly due: true; readonly eventId: string; readonly daysToStart: number }
  | { readonly due: false; readonly why: string }

function lifecycleClock(n: LifecycleNightClock, replied: boolean, now: Date) {
  // Only the asks are read here: what COMPLETE needs (picture, facts, handle, ticket link) does not move a letter.
  return eventClock(
    {
      startIso: n.startIso,
      endIso: n.endIso,
      foundIso: n.startIso,
      zone: n.zone,
      picture: 'none',
      factsChecked: true,
      collabHandle: true,
      sellsTickets: false,
      ticketLink: true,
      organiserContact: true,
      granted: n.granted,
      replied,
      sent: {},
    },
    now,
  )
}

/**
 * Whether this play's letter is due today, and on which night: the first of their nights, soonest first, whose clock has
 * the letter's step due today. An organiser found late starts at the night's current stage (found at T-10, PERM and ACQ
 * are both due, as two letters); inside T-7 nothing new goes. Pure.
 */
export function lifecycleChoice(key: LifecycleKey, r: LifecycleOrganiserRecord, now: Date): LifecycleChoice {
  const subtype = LIFECYCLE_SUBTYPE[key]
  if (r.replied) return { due: false, why: 'they have replied: the CRM answers them in their own thread, never with a cold letter' }
  if (r.alreadyAsked) return { due: false, why: `already asked: a ${subtype} letter went or is going to them, and one goes per organiser` }
  if (r.nights.length === 0) return { due: false, why: 'no public night of theirs is listed ahead' }
  const step = LIFECYCLE_STEP[key]
  for (const n of r.nights) {
    const clock = lifecycleClock(n, r.replied, now)
    if (clock.due.includes(step)) return { due: true, eventId: n.eventId, daysToStart: clock.daysToStart }
  }
  const first = lifecycleClock(r.nights[0], r.replied, now)
  const from = key === 'lifecycle_perm' ? 'T-28' : 'T-21'
  if (key === 'lifecycle_perm' && r.nights.every((n) => n.granted || lifecycleClock(n, r.replied, now).daysToStart > 28)) {
    return { due: false, why: `no night of theirs needs a photo asked for before ${from}: each in reach already shows their own photograph with recorded rights, or has images they gave us` }
  }
  return { due: false, why: `no night of theirs is due its letter today (from ${from}, never inside T-7); the nearest is ${first.daysToStart} day(s) away` }
}

/**
 * THE CLOCK AGAIN AT THE MOMENT OF SENDING (law 49: no new ask inside T-7, nothing on or after the night): a lifecycle
 * letter held over a weekend could otherwise land inside its night's final week. True while it may still go. Pure.
 */
export function lifecycleStillAsks(startIso: string, zone: string | null, now: Date): boolean {
  return daysToGo(startIso, zone, now) > COMPLETE_BY
}

import type { VoiceMessage } from '@/lib/outreach/voice-gate'
import { FOUNDING_INITIAL_MONTHS_WORD } from '@/lib/payments/founding-waiver'
import { firstName } from './organiser-live-notice-words'

/**
 * THE SELL-THROUGH REPORT (Lawal's ruling of 8 November 2026, 16:13, build 3: "The day after each listed event ends, its
 * organiser gets a short report from their own numbers (page views, saves, clicks through to their ticket seller), with
 * one line inviting them to sell their next event on EventLinqs ... Numbers only from what the site has counted; no claim
 * without its count. Automatic, through the gateway, in Lawal's style").
 *
 * Pure: when a report is due, the lines its figures make, and the message. The gateway's checks
 * (src/lib/outreach/voice-gate.ts, ported line for line from gateway.py) judge the message before any send. A service
 * message about the organiser's own listing, as the live notice is (the voice file's first-message form is the outreach
 * letter, whose subject must be "<their event>, could I ask your advice?"): "Hi <first name>," alone; "I hope you're
 * well, and that <event> was a great night." (C:\dev\START-16OCT\VOICE-EVENTLINQS.md, its third example); "Kind
 * regards," and his reply signature, which carries no ABN block outside a first message; then the opt out with its
 * unsubscribe link, which the communication law (7) asks of every message and the Spam Act of a commercial one.
 *
 * WHAT IS COUNTED, and nothing else is said (K14: a press out is never a sale):
 *   people who opened the event's page: distinct visitors in the page view ledger, crawlers refused before counting;
 *   people who saved it: saved_events, one per account;
 *   people who asked to be reminded: event_reminders, one per address;
 *   people who went on to the organiser's booking page: share_link_events 'outbound', distinct visitors.
 * A zero is left out rather than said; a report with nothing counted is not sent.
 *
 * THE OFFER LINE goes only to an organiser who ticked OFFERS_CONSENT_WORDS on the listing form (an offer makes a message
 * commercial under the Spam Act 2003; ACMA prefers express consent and puts the proof on the sender). Its months are
 * read from the one offer module (LAW 24), never typed.
 */

/** The first hour, in the event's own timezone, at which the day-after report may go: a morning, not a midnight. */
export const REPORT_LOCAL_HOUR = 9
/** A report not settled within this long after the event ended is recorded as too late, never sent weeks on. */
export const REPORT_LATEST_DAYS = 7
/** The unsubscribe facility every EventLinqs organiser email carries (src/app/unsubscribe/outreach/page.tsx). */
export const REPORT_UNSUBSCRIBE_URL = 'https://www.eventlinqs.com.au/unsubscribe/outreach'

const DAY_MS = 86_400_000

function localParts(at: Date, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

export type ReportTiming = { readonly due: true } | { readonly due: false; readonly why: string; readonly settle: boolean }

/**
 * Whether the report for an event that ended at `endIso` (in `timeZone`) goes now: on a later calendar day where it
 * happened, from REPORT_LOCAL_HOUR, and within REPORT_LATEST_DAYS. `settle` says the answer is final (too late), so the
 * run records it once rather than asking again every hour.
 */
export function reportTiming(endIso: string, timeZone: string, now: Date): ReportTiming {
  const ended = new Date(endIso)
  if (!Number.isFinite(ended.getTime())) return { due: false, why: 'the event has no end time', settle: true }
  if (now.getTime() <= ended.getTime()) return { due: false, why: 'the event has not ended', settle: false }
  if (now.getTime() - ended.getTime() > REPORT_LATEST_DAYS * DAY_MS) return { due: false, why: `the event ended over ${REPORT_LATEST_DAYS} days ago`, settle: true }
  const end = localParts(ended, timeZone)
  const at = localParts(now, timeZone)
  if (at.day <= end.day) return { due: false, why: 'the day after has not come where it happened', settle: false }
  if (at.hour < REPORT_LOCAL_HOUR) return { due: false, why: `before ${REPORT_LOCAL_HOUR} am where it happened`, settle: false }
  return { due: true }
}

export type ReportFigures = {
  /** Distinct people who opened the event's page. */
  readonly viewers: number
  readonly saves: number
  readonly reminders: number
  /** Distinct people sent on to the organiser's booking page. */
  readonly wentToBooking: number
}

const people = (n: number) => (n === 1 ? '1 person' : `${n.toLocaleString('en-AU')} people`)

/** One line per counted figure above zero, in the order a visitor goes: found it, kept it, went to buy. */
export function figureLines(f: ReportFigures): string[] {
  const lines: string[] = []
  if (f.viewers > 0) lines.push(`${people(f.viewers)} opened its page.`)
  if (f.saves > 0) lines.push(`${people(f.saves)} saved it.`)
  if (f.reminders > 0) lines.push(`${people(f.reminders)} asked us to remind them before it started.`)
  if (f.wentToBooking > 0) lines.push(`${people(f.wentToBooking)} went on from it to your booking page.`)
  return lines
}

export type ReportFacts = {
  /** The address the organiser sent the event from. */
  readonly to: string
  /** The name the organiser gave on the form. */
  readonly name: string
  readonly title: string
  readonly venue: string
  readonly figures: ReportFigures
  /** True only when the organiser ticked OFFERS_CONSENT_WORDS; the offer line is said only then. */
  readonly mayOffer: boolean
  /** The site's origin, for the door's link. */
  readonly origin: string
}

/** The report as the gateway judges it, or null when nothing was counted (nothing is sent). */
export function sellThroughMessage(facts: ReportFacts, from: string, signature: readonly string[]): VoiceMessage | null {
  const lines = figureLines(facts.figures)
  if (lines.length === 0) return null
  const first = firstName(facts.name)
  const door = `${facts.origin.replace(/\/+$/, '')}/start?src=report`
  const body = [
    `Hi ${first},`,
    '',
    `I hope you're well, and that ${facts.title} at ${facts.venue} was a great night.`,
    '',
    'Here is what EventLinqs counted for it, from its page on our site:',
    ...lines,
    '',
    'Each is a person, counted once. We can see who went on to your booking page, but not what they bought there.',
    ...(facts.mayOffer
      ? [
          '',
          `Your next event can sell on EventLinqs too, with its own ticket page, checkout and payouts, and no platform fee for your first ${FOUNDING_INITIAL_MONTHS_WORD} months from the day you register:`,
          door,
        ]
      : []),
    '',
    `Thank you again for trusting us with ${facts.title}.`,
    '',
    'Kind regards,',
    ...signature,
    `If you'd rather I didn't write again, just reply and say so, or unsubscribe here: ${REPORT_UNSUBSCRIBE_URL}`,
  ].join('\n')
  return {
    channel: 'email',
    category: 'service',
    from,
    to: [facts.to],
    subject: `How ${facts.title} did on EventLinqs`,
    greetingName: first,
    body,
  }
}

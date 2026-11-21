import { startOfLocalDayUtc, startOfLocalDayUtcOffset } from '@/lib/events/listing-window'

/**
 * THE EVENT CLOCK (law 49, Lawal's 09:20 of 21 November 2026; C:\dev\START-16OCT\EVENT-LIFECYCLE-ENGINE-LOCKED-21NOV.md
 * section 2). Every event has a clock: T is its start, D the day we found it. From T, D and what the event already has,
 * this one pure function says where the event stands, which organiser steps are due today, the next step and the day it
 * falls due, and what still stands between the event and COMPLETE at T minus 7.
 *
 * It decides days, never hours: the scheduler puts a due step into the sending window (Monday to Saturday, 06:00 to
 * 08:59 in the organiser's zone, law 44; nextWindowStart in src/lib/outreach/self-queue.ts) and through the gateway.
 * Days are counted in the event's own zone, calendar day to calendar day, so a daylight saving change never moves a step.
 *
 * The rules, from the locked table:
 * - PERM (one photo permission request, from hello@) from T-28; ACQ (the free promotion offer, from lawal@, never in the
 *   same letter) from T-21. An event found late starts at its current stage: found at T-10, PERM and ACQ fall due the
 *   same day, as two letters.
 * - The PERM follow up, once, from T-17, only with no reply and at least four days after the request; the last PERM
 *   touch, once, from T-10, at least three days after the touch before it.
 * - No ask inside T-7: from T-7 to the event's day nothing new goes to the organiser; on its day nothing at all.
 * - RET: the results note from the day after the event ends to three days after; then the clock is closed.
 * - COMPLETE at T-7: a lawful picture (the organiser's grant, an official seller API, else licensed illustrative),
 *   the facts read again, the collaboration handle, and a ticket link for a night that sells tickets.
 */

export type ClockStage = 'early' | 'perm' | 'acq' | 'chase' | 'final_week' | 'quiet' | 'day' | 'results' | 'closed'
export type ClockStep = 'perm_request' | 'acq_offer' | 'perm_follow_up' | 'perm_last' | 'results_note'
export type PictureBasis = 'organiser' | 'official_api' | 'illustrative' | 'none'

export type ClockInput = {
  readonly startIso: string
  readonly endIso?: string | null
  /** When the engine first found the event (D). */
  readonly foundIso: string
  readonly zone: string
  readonly picture: PictureBasis
  readonly factsChecked: boolean
  readonly collabHandle: boolean
  /** A night that sells tickets needs its ticket link; a free or walk in night does not. */
  readonly sellsTickets: boolean
  readonly ticketLink: boolean
  /** An organiser address the engine may lawfully write to (law 21, law 33). */
  readonly organiserContact: boolean
  /** The organiser's own photograph is already granted: no PERM is needed. */
  readonly granted: boolean
  readonly replied: boolean
  readonly sent: {
    readonly perm?: string | null
    readonly permFollowUp?: string | null
    readonly permLast?: string | null
    readonly acq?: string | null
    readonly results?: string | null
  }
}

export type ClockMissing = 'picture' | 'facts' | 'collab_handle' | 'ticket_link'

export type EventClock = {
  readonly stage: ClockStage
  /** Calendar days from today to the event's first day, in its zone (0 on its day, negative once it has begun). */
  readonly daysToStart: number
  /** Organiser steps due today, in the order they go (each its own letter; law 24). */
  readonly due: readonly ClockStep[]
  /** The next organiser step not yet due, and the first day it falls due (its local midnight, as a UTC instant). */
  readonly next: { readonly step: ClockStep; readonly from: string } | null
  readonly missing: readonly ClockMissing[]
  readonly complete: boolean
}

export const PERM_FROM = 28
export const ACQ_FROM = 21
export const FOLLOW_UP_FROM = 17
export const LAST_TOUCH_FROM = 10
export const COMPLETE_BY = 7
export const QUIET_FROM = 3
export const RESULTS_DAYS = 3
const FOLLOW_UP_GAP = 4
const LAST_TOUCH_GAP = 3

/** Calendar days from a's local day to b's local day, in zone. */
function dayGap(a: Date, b: Date, zone: string): number {
  const from = startOfLocalDayUtc(a, zone).getTime()
  const to = startOfLocalDayUtc(b, zone).getTime()
  // Local midnights a daylight saving change apart differ by 23 or 25 hours: rounding gives the calendar count.
  return Math.round((to - from) / 86_400_000)
}

export function eventClock(input: ClockInput, now: Date): EventClock {
  const zone = input.zone
  const start = new Date(input.startIso)
  const end = new Date(input.endIso ?? input.startIso)
  const daysToStart = dayGap(now, start, zone)
  const daysAfterEnd = dayGap(end, now, zone)
  const at = (iso: string | null | undefined) => (iso ? new Date(iso) : null)

  const stage: ClockStage =
    daysAfterEnd > RESULTS_DAYS ? 'closed'
    : daysAfterEnd >= 1 ? 'results'
    : daysToStart <= 0 ? 'day'
    : daysToStart <= QUIET_FROM ? 'quiet'
    : daysToStart <= COMPLETE_BY ? 'final_week'
    : daysToStart <= LAST_TOUCH_FROM ? 'chase'
    : daysToStart <= ACQ_FROM ? 'acq'
    : daysToStart <= PERM_FROM ? 'perm'
    : 'early'

  const missing: ClockMissing[] = []
  if (input.picture === 'none') missing.push('picture')
  if (!input.factsChecked) missing.push('facts')
  if (!input.collabHandle) missing.push('collab_handle')
  if (input.sellsTickets && !input.ticketLink) missing.push('ticket_link')

  // The day each step may first go, as a count of days before the event (or after its end, for the results note).
  const asks = input.organiserContact && daysToStart > COMPLETE_BY
  const permSent = at(input.sent.perm)
  const followSent = at(input.sent.permFollowUp)
  const lastBefore = followSent ?? permSent
  type Rule = { step: ClockStep; applies: boolean; firstDay: Date }
  const dayBefore = (n: number) => startOfLocalDayUtcOffset(start, zone, -n)
  const rules: Rule[] = [
    { step: 'perm_request', applies: !input.granted && !permSent, firstDay: dayBefore(PERM_FROM) },
    { step: 'acq_offer', applies: !at(input.sent.acq), firstDay: dayBefore(ACQ_FROM) },
    {
      step: 'perm_follow_up',
      applies: !input.granted && !input.replied && permSent !== null && !followSent && !at(input.sent.permLast),
      firstDay: permSent ? latest(dayBefore(FOLLOW_UP_FROM), startOfLocalDayUtcOffset(permSent, zone, FOLLOW_UP_GAP)) : dayBefore(FOLLOW_UP_FROM),
    },
    {
      step: 'perm_last',
      applies: !input.granted && !input.replied && lastBefore !== null && !at(input.sent.permLast),
      firstDay: lastBefore ? latest(dayBefore(LAST_TOUCH_FROM), startOfLocalDayUtcOffset(lastBefore, zone, LAST_TOUCH_GAP)) : dayBefore(LAST_TOUCH_FROM),
    },
  ]
  const askDeadline = dayBefore(COMPLETE_BY) // from this day on, no ask
  const due: ClockStep[] = []
  let next: EventClock['next'] = null
  const today = startOfLocalDayUtc(now, zone)
  if (asks) {
    for (const r of rules) {
      if (!r.applies || r.firstDay.getTime() >= askDeadline.getTime()) continue
      // A follow up whose request has not gone yet is not due; it waits on the request.
      if (r.firstDay.getTime() <= today.getTime()) due.push(r.step)
      else if (!next || r.firstDay.getTime() < Date.parse(next.from)) next = { step: r.step, from: r.firstDay.toISOString() }
    }
    // A follow up cannot share the day of the request it follows, nor the last touch the day of the follow up.
    if (due.includes('perm_request')) for (const s of ['perm_follow_up', 'perm_last'] as const) remove(due, s)
    if (due.includes('perm_follow_up')) remove(due, 'perm_last')
  }
  const resultsFrom = startOfLocalDayUtcOffset(end, zone, 1)
  if (input.organiserContact && !at(input.sent.results) && stage !== 'closed') {
    if (stage === 'results') due.push('results_note')
    else if (!next) next = { step: 'results_note', from: resultsFrom.toISOString() }
  }
  return { stage, daysToStart, due, next, missing, complete: missing.length === 0 }
}

function latest(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b
}

function remove(list: ClockStep[], step: ClockStep): void {
  const i = list.indexOf(step)
  if (i >= 0) list.splice(i, 1)
}

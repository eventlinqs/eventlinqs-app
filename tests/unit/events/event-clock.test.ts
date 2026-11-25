import { describe, expect, it } from 'vitest'
import { eventClock, PERM_LAST_ON, type ClockInput, type ClockStage, type ClockStep } from '@/lib/events/event-clock'
import { startOfLocalDayUtcOffset } from '@/lib/events/listing-window'

/*
 * LAW 49, THE EVENT CLOCK (Lawal, 21 November 2026, 09:20: "make the request go out days or a week before it ... At
 * least a week before the event, we should have everything"; C:\dev\START-16OCT\EVENT-LIFECYCLE-ENGINE-LOCKED-21NOV.md).
 * A fake event is driven day by day from the day it is found to after it ends, through a recording sender that marks
 * each due step sent, and every stage and every letter is read back against the locked table.
 */
const ZONE = 'Australia/Melbourne'
const at7 = (day: Date) => new Date(day.getTime() + 7 * 3_600_000) // 07:00 local, inside the window (law 44)
const base = (over: Partial<ClockInput> = {}): ClockInput => ({
  startIso: '2026-12-26T09:00:00Z', // Saturday 26 December, 8pm in Melbourne
  endIso: '2026-12-26T12:00:00Z', // 11pm the same night: its last local day is the 26th
  foundIso: '2026-11-21T00:00:00Z',
  zone: ZONE,
  picture: 'illustrative',
  factsChecked: true,
  collabHandle: true,
  sellsTickets: true,
  ticketLink: true,
  organiserContact: true,
  granted: false,
  replied: false,
  sent: {},
  ...over,
})
const SENT_FIELD: Record<ClockStep, keyof ClockInput['sent']> = {
  perm_request: 'perm',
  acq_offer: 'acq',
  perm_follow_up: 'permFollowUp',
  perm_last: 'permLast',
  acq_follow_up: 'acqFollowUp',
  results_note: 'results',
}

/** Drives the clock once a day from `fromDay` (days before T, local) to four days after, sending each due step. */
function drive(input: ClockInput, fromDay: number, onDay?: (daysToStart: number, state: ClockInput) => ClockInput) {
  const start = new Date(input.startIso)
  let state = input
  const letters: { step: ClockStep; daysToStart: number }[] = []
  const stages: { daysToStart: number; stage: ClockStage }[] = []
  for (let d = fromDay; d >= -4; d--) {
    const now = at7(startOfLocalDayUtcOffset(start, ZONE, -d))
    if (onDay) state = onDay(d, state)
    const clock = eventClock(state, now)
    expect(clock.daysToStart).toBe(d)
    stages.push({ daysToStart: d, stage: clock.stage })
    for (const step of clock.due) {
      letters.push({ step, daysToStart: d })
      state = { ...state, sent: { ...state.sent, [SENT_FIELD[step]]: now.toISOString() } }
    }
  }
  return { letters, stages }
}

describe('an event found five weeks out, the organiser never answering', () => {
  const { letters, stages } = drive(base(), 35)
  it('every letter goes on its day, once each, and nothing in the final week or on the day', () => {
    expect(letters).toEqual([
      { step: 'perm_request', daysToStart: 28 },
      { step: 'acq_offer', daysToStart: 21 },
      { step: 'perm_follow_up', daysToStart: 17 },
      { step: 'acq_follow_up', daysToStart: 14 },
      { step: 'results_note', daysToStart: -1 },
    ])
  })
  it('passes through every stage in order', () => {
    const at = (d: number) => stages.find((s) => s.daysToStart === d)?.stage
    expect([at(35), at(29), at(28), at(22), at(21), at(11), at(10), at(8), at(7), at(4), at(3), at(1), at(0), at(-1), at(-3), at(-4)]).toEqual([
      'early', 'early', 'perm', 'perm', 'acq', 'acq', 'chase', 'chase', 'final_week', 'final_week', 'quiet', 'quiet', 'day', 'results', 'results', 'closed',
    ])
  })
})

describe('the organiser answers the permission request', () => {
  it('a reply stops the follow ups; the offer and the results note still go', () => {
    const { letters } = drive(base(), 35, (d, s) => (d === 25 ? { ...s, replied: true } : s))
    expect(letters.map((l) => l.step)).toEqual(['perm_request', 'acq_offer', 'results_note'])
  })
  it('an organiser photograph already granted needs no permission request at all', () => {
    const { letters } = drive(base({ granted: true, picture: 'organiser' }), 35)
    expect(letters.map((l) => l.step)).toEqual(['acq_offer', 'acq_follow_up', 'results_note'])
  })
})

describe('the follow ups: one each, never a second (the standard Lawal adopted on 22 November 2026)', () => {
  it('the last PERM touch at T-10 is switched off, superseded by the one follow up', () => {
    expect(PERM_LAST_ON).toBe(false)
    expect(drive(base(), 35).letters.map((l) => l.step)).not.toContain('perm_last')
  })
  it('the ACQ follow up waits four days after its offer, and both follow ups go once', () => {
    const { letters } = drive(base(), 17)
    expect(letters).toEqual([
      { step: 'perm_request', daysToStart: 17 },
      { step: 'acq_offer', daysToStart: 17 },
      { step: 'perm_follow_up', daysToStart: 13 },
      { step: 'acq_follow_up', daysToStart: 13 },
      { step: 'results_note', daysToStart: -1 },
    ])
  })
  it('a reply after the offer stops its follow up', () => {
    const { letters } = drive(base(), 35, (d, s) => (d === 16 ? { ...s, replied: true } : s))
    expect(letters.map((l) => l.step)).toEqual(['perm_request', 'acq_offer', 'perm_follow_up', 'results_note'])
  })
})

describe('an event found late starts at its current stage', () => {
  it('found at T minus 10: the request and the offer the same day, as two letters, and no chase after', () => {
    const { letters } = drive(base(), 10)
    expect(letters).toEqual([
      { step: 'perm_request', daysToStart: 10 },
      { step: 'acq_offer', daysToStart: 10 },
      { step: 'results_note', daysToStart: -1 },
    ])
  })
  it('found inside T minus 7: no ask before its day, only the results note after', () => {
    const { letters } = drive(base(), 5)
    expect(letters).toEqual([{ step: 'results_note', daysToStart: -1 }])
  })
  it('no organiser address: no letter at all', () => {
    expect(drive(base({ organiserContact: false }), 35).letters).toEqual([])
  })
})

describe('what stands between the event and COMPLETE at T minus 7', () => {
  const now = at7(startOfLocalDayUtcOffset(new Date('2026-12-26T09:00:00Z'), ZONE, -7))
  it('a lawful picture (illustrative counts), the facts, the handle, and a ticket link for a night that sells', () => {
    expect(eventClock(base(), now)).toMatchObject({ stage: 'final_week', complete: true, missing: [] })
    expect(eventClock(base({ picture: 'none', factsChecked: false, collabHandle: false, ticketLink: false }), now).missing).toEqual(['picture', 'facts', 'collab_handle', 'ticket_link'])
    expect(eventClock(base({ sellsTickets: false, ticketLink: false }), now).complete).toBe(true)
  })
  it('names the next step and its first day while one is still to come', () => {
    const early = eventClock(base(), at7(startOfLocalDayUtcOffset(new Date('2026-12-26T09:00:00Z'), ZONE, -35)))
    expect(early.due).toEqual([])
    expect(early.next).toEqual({ step: 'perm_request', from: startOfLocalDayUtcOffset(new Date('2026-12-26T09:00:00Z'), ZONE, -28).toISOString() })
  })
})

describe('a multi day night and a daylight saving change', () => {
  it('a festival under way is on its day until it ends; the results note follows its last day', () => {
    const fest = base({ startIso: '2026-11-20T00:00:00Z', endIso: '2026-11-22T09:00:00Z' })
    expect(eventClock(fest, new Date('2026-11-20T20:00:00Z')).stage).toBe('day') // Saturday 21, its second day
    expect(eventClock(fest, new Date('2026-11-22T20:00:00Z')).due).toEqual(['results_note']) // Monday 23
  })
  it('counts calendar days across the start of daylight saving (Sunday 4 October 2026)', () => {
    const oct = base({ startIso: '2026-10-10T09:00:00Z', endIso: '2026-10-10T12:00:00Z' })
    expect(eventClock(oct, new Date('2026-10-02T21:00:00Z')).daysToStart).toBe(7) // Saturday 3 October, 07:00 local (AEST)
    expect(eventClock(oct, new Date('2026-10-02T21:00:00Z')).stage).toBe('final_week')
  })
})

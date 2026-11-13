/*
 * THE EVENT DISCOVERY ENGINE'S DAY LINE AND ITS SEVEN DAY PROOF (Lawal's 18:28 and 18:31 of 13 November 2026). The judge
 * passes a day only when all six parts pass AND no window or person touched the sources, candidates or listings; the
 * count goes on only from the day before and a FAIL or a manual step sets it to zero. The run writes the line in the same
 * function as its reads, after them, and never fails because of it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  addTurn,
  dayBefore,
  dayLineWords,
  DISCOVERY_PARTS,
  judgeDay,
  melbourneDay,
  melbourneDayBounds,
  type DayEvidence,
  type TurnNumbers,
} from '@/lib/listings/discovery-day'
import { crmNameKey, crmWebsite } from '@/lib/listings/discovery-organisers'

const turn = (at: string, scout: TurnNumbers['scout'] = null): TurnNumbers => ({
  at, read: 5, landed: 2, acceptedByRule: 1, queued: 1, failed: 0, organisersAttached: 0, scout,
})

const fourTurns = () => {
  let d = addTurn(null, turn('2026-11-13T18:25:00Z'))
  d = addTurn(d, turn('2026-11-14T00:25:00Z'))
  d = addTurn(d, turn('2026-11-14T06:25:00Z'))
  return addTurn(d, turn('2026-11-14T12:25:00Z', { examined: 12, registered: 2, errors: 0 }))
}

const clean = (over: Partial<DayEvidence> = {}): DayEvidence => ({
  numbers: fourTurns(), turnsRan: 4, runs: 20, runFailures: 1, writeFailures: 0, published: 9, held: 3, heldWithoutReason: 0,
  organisersAdded: 2, listingsWithoutOrganiser: 0, duplicatesListed: 0, holdsOverdue: 0, changesWaiting: 0, manualSteps: 0,
  manualDetail: [], ...over,
})

describe('the day line builds through the day', () => {
  test('each turn adds its numbers, and the scout counts only in the turn it ran', () => {
    const d = fourTurns()
    expect(d.turns).toHaveLength(4)
    expect(d.scout).toEqual({ examined: 12, registered: 2, errors: 0, ran: true })
    expect(addTurn(null, turn('2026-11-14T00:25:00Z')).scout.ran).toBe(false)
  })
})

describe('the judge', () => {
  test('a clean day passes all six and counts on from the day before', () => {
    const v = judgeDay(clean(), { consecutiveDays: 3 })
    expect(DISCOVERY_PARTS.every((p) => v.checks[p].pass)).toBe(true)
    expect(v.allPassed).toBe(true)
    expect(v.consecutiveDays).toBe(4)
    expect(judgeDay(clean(), null).consecutiveDays).toBe(1)
  })

  test('one manual step sets the count to zero, even with every part passing', () => {
    const v = judgeDay(clean({ manualSteps: 1, manualDetail: ['1 candidate decision(s) by a person'] }), { consecutiveDays: 6 })
    expect(DISCOVERY_PARTS.every((p) => v.checks[p].pass)).toBe(true)
    expect(v.allPassed).toBe(false)
    expect(v.consecutiveDays).toBe(0)
  })

  test.each([
    ['a', { numbers: addTurn(addTurn(addTurn(addTurn(null, turn('x')), turn('y')), turn('z')), turn('w')) }, 'the scout did not run'],
    ['b', { turnsRan: 3 }, 'only 3 of 4 turns ran'],
    ['c', { writeFailures: 2 }, '2 runs could not write a night'],
    ['c', { heldWithoutReason: 1 }, '1 night held without a reason'],
    ['d', { listingsWithoutOrganiser: 118 }, '118 upcoming listings at a venue with no CRM organiser'],
    ['e', { holdsOverdue: 34, changesWaiting: 137 }, '34 holds overdue or unscheduled; 137 changed nights waiting on a person'],
    ['e', { duplicatesListed: 1 }, '1 duplicate listed'],
  ] as const)('part (%s) fails with its reason and resets the count', (part, over, why) => {
    const v = judgeDay(clean(over as Partial<DayEvidence>), { consecutiveDays: 5 })
    expect(v.checks[part].pass).toBe(false)
    expect(v.checks[part].why).toBe(why)
    expect(v.consecutiveDays).toBe(0)
  })

  test('a scout that met errors fails (a)', () => {
    let d = fourTurns()
    d = { ...d, scout: { ...d.scout, errors: 1 } }
    expect(judgeDay(clean({ numbers: d }), null).checks.a).toEqual({ pass: false, why: 'the scout met 1 error' })
  })
})

describe('Melbourne days', () => {
  test('the day of an instant is Melbourne\'s, not UTC\'s', () => {
    expect(melbourneDay(new Date('2026-11-13T13:30:00Z'))).toBe('2026-11-14')
    expect(melbourneDay(new Date('2026-11-13T12:59:00Z'))).toBe('2026-11-13')
    expect(dayBefore('2026-11-01')).toBe('2026-10-31')
  })
  test('a day runs from its own midnight to the next, in daylight saving and out of it', () => {
    expect(melbourneDayBounds('2026-11-14')).toEqual({ from: '2026-11-13T13:00:00.000Z', to: '2026-11-14T13:00:00.000Z' })
    expect(melbourneDayBounds('2026-07-01')).toEqual({ from: '2026-06-30T14:00:00.000Z', to: '2026-07-01T14:00:00.000Z' })
  })
  test('the line names the day, the count of seven, each part and the manual steps', () => {
    const v = judgeDay(clean(), { consecutiveDays: 1 })
    expect(dayLineWords({ day: '2026-11-14', checks: v.checks, manualSteps: 0, consecutiveDays: v.consecutiveDays })).toBe(
      '2026-11-14: day 2 of 7; (a) PASS, (b) PASS, (c) PASS, (d) PASS, (e) PASS, (f) PASS; 0 manual steps',
    )
  })
})

describe('the CRM organiser of a venue', () => {
  test('its name key is the CRM\'s own (lower, trimmed, single spaces)', () => {
    expect(crmNameKey('  The  JazzLab ')).toBe('the jazzlab')
  })
  test('its website is https only, kept as its origin', () => {
    expect(crmWebsite('https://www.forum.com.au/whats-on?x=1')).toBe('https://www.forum.com.au')
    expect(crmWebsite('http://forum.com.au')).toBeNull()
    expect(crmWebsite('not a url')).toBeNull()
    expect(crmWebsite(null)).toBeNull()
  })
})

describe('the run', () => {
  const ROUTE = readFileSync(resolve(process.cwd(), 'src/app/api/cron/collection-run/route.ts'), 'utf8').replace(/\r\n/g, '\n')
  test('attaches organisers and writes the day line after the reads, inside the same function, never failing the run', () => {
    const reads = ROUTE.indexOf('await runCollection(')
    const attach = ROUTE.indexOf('await attachOrganisers(')
    const judge = ROUTE.indexOf('await days.judgeYesterday(')
    const record = ROUTE.indexOf('await days.recordTurn(')
    expect(reads).toBeGreaterThan(-1)
    expect(attach).toBeGreaterThan(reads)
    expect(judge).toBeGreaterThan(attach)
    expect(record).toBeGreaterThan(judge)
    expect(ROUTE).toContain("organisers = `the organisers step failed:")
    expect(ROUTE).toContain("line = `the day line failed:")
    expect(ROUTE).toContain('if (end - Date.now() >= ENGINE_MIN_LEFT_MS)')
  })
})

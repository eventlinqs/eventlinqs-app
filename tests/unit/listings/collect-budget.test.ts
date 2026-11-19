import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectionDeadline, SCOUT_MARGIN_MS, SCOUT_MIN_LEFT_MS, scoutMayStart, scoutSkippedLine } from '@/lib/listings/collect-budget'

/*
 * THE SCOUT'S TIME IS HELD BACK ON ITS TURN (the PM's 02:40 of 19 November 2026, gap 1). Read on production at 02:50:
 * every night's 23:25 turn on 15, 16 and 17 November recorded no scout, because the collection run had the whole budget.
 */
const BUDGET = 240_000
const STARTED = Date.parse('2026-11-18T12:25:21Z') // 23:25:21 in Melbourne

describe("the scout's turn leaves the scout its time", () => {
  it('on its turn, a collection that runs to its deadline still leaves the scout its 90 s, with the margin for a page', () => {
    const deadline = collectionDeadline(STARTED, BUDGET, true)
    // The collection may run its last page up to the margin past its deadline: the scout still starts.
    expect(scoutMayStart(STARTED, BUDGET, deadline + SCOUT_MARGIN_MS, true)).toBe(true)
    expect(STARTED + BUDGET - deadline).toBe(SCOUT_MIN_LEFT_MS + SCOUT_MARGIN_MS)
  })

  it('every other turn keeps the whole budget, and the scout never starts there', () => {
    expect(collectionDeadline(STARTED, BUDGET, false)).toBe(STARTED + BUDGET)
    expect(scoutMayStart(STARTED, BUDGET, STARTED, false)).toBe(false)
  })

  it('a scout turn that comes without its time names why', () => {
    expect(scoutMayStart(STARTED, BUDGET, STARTED + 200_000, true)).toBe(false)
    expect(scoutSkippedLine(STARTED, BUDGET, STARTED + 200_000)).toBe('the scout had 40 s left, under its 90 s')
  })

  it('the collection run gives the collection that deadline on the scout turn', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/cron/collection-run/route.ts'), 'utf8')
    expect(route).toMatch(/runCollection\([^\n]*collectionDeadline\(started, RUN_BUDGET_MS, scoutTurn\)\)/)
    expect(route).toMatch(/scoutMayStart\(started, RUN_BUDGET_MS, Date\.now\(\), scoutTurn\)/)
    expect(route).not.toMatch(/runCollection\([^\n]*started \+ RUN_BUDGET_MS\)/)
  })
})

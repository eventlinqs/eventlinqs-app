import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { POOL_PER_NIGHT, POOL_PER_NIGHT_SHORT, POOL_TARGET, poolCapForNeed, poolLine } from '@/lib/outreach/basis-pool'

/*
 * M3 (the PM's 12:18 of 27 November 2026: "No contact has been added since 25 November. The pool is not being
 * refilled"). Red on main, where the nightly pool turn read twelve organisers whatever the pool held and wrote its result
 * to the function log alone: while the next send day holds fewer than twenty lawful contacts never written to, the night
 * reads the short week's cap, and the turn's own ops_phase_runs row says the pool before and after and, when still short,
 * by how many and why.
 */
const read = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

describe('the pool kept full', () => {
  it('reads the short cap while the pool is under twenty or unread, else the week cap', () => {
    expect(POOL_TARGET).toBe(20)
    expect(poolCapForNeed(6, POOL_PER_NIGHT)).toBe(POOL_PER_NIGHT_SHORT)
    expect(poolCapForNeed(null, POOL_PER_NIGHT)).toBe(POOL_PER_NIGHT_SHORT)
    expect(poolCapForNeed(25, POOL_PER_NIGHT)).toBe(POOL_PER_NIGHT)
  })
  it('says the pool before and after, what was read, and a shortfall with its reasons', () => {
    const outcomes = [
      { organiser: 'A', outcome: 'recorded events@a.com.au', recorded: 1 },
      { organiser: 'B', outcome: 'the site answered 403: never read', recorded: 0 },
      { organiser: 'C', outcome: 'no published events address on its pages', recorded: 0 },
      { organiser: 'D', outcome: 'no published events address on its pages', recorded: 0 },
    ]
    expect(poolLine(6, 7, outcomes)).toBe(
      "pool for the next send day: 6 before, 7 after; read 4 organisers' own sites, 1 address recorded; SHORT by 13 of its target of 20; none found: 2 no published events address on its pages; 1 the site answered N: never read",
    )
    expect(poolLine(19, 21, [])).toBe("pool for the next send day: 19 before, 21 after; read 0 organisers' own sites, 0 addresses recorded; at or above its target of 20")
    expect(poolLine(null, null, [])).toContain('not read before, not read after')
  })
  it("the nightly turn reads the pool before and after and writes its own row", () => {
    const route = read('src/app/api/cron/outreach-run/route.ts')
    expect(route).toContain('const cap = poolCapForNeed(before, poolCapFor(await weekFirstLetters(db, now).catch(() => 0)))')
    expect(route).toMatch(/phase: 'prepare',\n\s+ride: 'outreach',/)
    expect(route).toContain('failed: after === null || after < POOL_TARGET,')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE ATTRIBUTION BACKSTOP, HELD TO THE FOUR THINGS THAT MAKE IT A GUARANTEE
 * RATHER THAN A SECOND CHANCE.
 *
 * GA3's invariant is that every order carries exactly one stored decision. A
 * build guard checks it, and the guard's own header says what it cannot do: in
 * CI it points at a placeholder project and skips, and on production nothing
 * runs it. The backstop is what makes the invariant true on the database where
 * it is money.
 *
 * The four things, and each one is a way a repair job quietly stops repairing:
 *
 *   1. IT REPAIRS WHAT THE GATE WOULD FAIL ON, and nothing else. Both read the
 *      same view, so the healer cannot develop its own opinion about what is
 *      broken.
 *   2. IT LEAVES THE RACE ALONE. An order younger than the resolution window is
 *      not missing, it is mid-flight, and repairing it would race the request's
 *      own resolver for no gain.
 *   3. IT NEVER REPORTS SUCCESS WHEN IT COULD NOT LOOK. An unreachable database
 *      throws. "Nothing to heal" is the most dangerous sentence this job can
 *      say, because it is also what a healthy platform says.
 *   4. IT CONFIRMS BY ASKING AGAIN. `healed` counts rows the view then reports
 *      as present, never writes that returned without an error.
 *
 * The stubs below are the supabase builder shape used across these tests. The
 * resolver is stubbed because WHAT it decides is proven exhaustively in
 * attribution-spine.test.ts; what is proven here is the repair loop around it.
 */

interface BreachRow {
  breach: string
  order_id: string
  order_reference: string
}

const state: {
  breaches: BreachRow[]
  /** Read after the repair pass, so a test can say which repairs worked. */
  breachesAfter: BreachRow[] | null
  youngOrderIds: string[]
  breachReadFails: string | null
  ordersReadFails: string | null
  resolveCalls: string[]
  breachReads: number
} = {
  breaches: [],
  breachesAfter: null,
  youngOrderIds: [],
  breachReadFails: null,
  ordersReadFails: null,
  resolveCalls: [],
  breachReads: 0,
}

/*
 * THE VIEW, MODELLED WITH ITS PAGING.
 *
 * The backstop pages this read (readEveryRow) since 19 September 2026, because
 * an unbounded response stops at 1,000 rows in silence and would leave the
 * remainder unrecorded for ever. A mock that answers `.range()` by ignoring it
 * would let a broken pager pass, so this one slices.
 *
 * `breachReads` counts LOGICAL reads, not requests: a read starts at range 0,
 * and the follow-up page that proves the end has been reached is part of the
 * same question. Every test that counts reads is asking how many times the view
 * was consulted, which is still exactly what it counts.
 */
function viewBuilder() {
  const b: Record<string, unknown> = {}
  let from = 0
  let to = Number.POSITIVE_INFINITY
  b.select = () => b
  b.eq = () => b
  b.order = () => b
  b.range = (f: number, t: number) => {
    from = f
    to = t
    return b
  }
  ;(b as { then: unknown }).then = (resolve: (v: unknown) => void) => {
    if (from === 0) state.breachReads += 1
    if (state.breachReadFails) return resolve({ data: null, error: { message: state.breachReadFails } })
    const rows = state.breachReads === 1 || state.breachesAfter === null ? state.breaches : state.breachesAfter
    return resolve({ data: rows.slice(from, to + 1), error: null })
  }
  return b
}

function ordersBuilder() {
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.in = () => b
  b.gt = () => b
  b.limit = () => b
  ;(b as { then: unknown }).then = (resolve: (v: unknown) => void) => {
    if (state.ordersReadFails) return resolve({ data: null, error: { message: state.ordersReadFails } })
    return resolve({ data: state.youngOrderIds.map(id => ({ id })), error: null })
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === 'marketing_attribution_invariant_breaches' ? viewBuilder() : ordersBuilder(),
  }),
}))

vi.mock('@/lib/attribution/store', () => ({
  resolveAndStoreOrder: async (orderId: string) => {
    state.resolveCalls.push(orderId)
    return null
  },
}))

import {
  BACKSTOP_MAX_PER_RUN,
  NO_RECORD_BREACH,
  RESOLUTION_GRACE_MS,
  healUnrecordedOrders,
} from '@/lib/attribution/backstop'

function breach(n: number): BreachRow {
  return { breach: NO_RECORD_BREACH, order_id: `order-${n}`, order_reference: `EL-REF${n}` }
}

beforeEach(() => {
  state.breaches = []
  state.breachesAfter = null
  state.youngOrderIds = []
  state.breachReadFails = null
  state.ordersReadFails = null
  state.resolveCalls = []
  state.breachReads = 0
})

describe('the backstop repairs exactly what the gate would fail on', () => {
  it('repairs every order the view reports with no record, and confirms by asking again', async () => {
    state.breaches = [breach(1), breach(2), breach(3)]
    state.breachesAfter = []

    const result = await healUnrecordedOrders()

    expect(state.resolveCalls).toEqual(['order-1', 'order-2', 'order-3'])
    expect(result.unrecorded).toBe(3)
    expect(result.attempted).toBe(3)
    expect(result.healed).toBe(3)
    expect(result.unhealed).toEqual([])
    expect(result.capped).toBe(false)
  })

  it('does nothing at all, and reads nothing further, when the view is empty', async () => {
    state.breaches = []

    const result = await healUnrecordedOrders()

    expect(result).toEqual({ unrecorded: 0, withinGrace: 0, attempted: 0, healed: 0, unhealed: [], capped: false })
    expect(state.resolveCalls).toEqual([])
    // One read, not two: a sound platform costs this job a single query.
    expect(state.breachReads).toBe(1)
  })

  it('counts an order the repair did not fix as UNHEALED, by its reference, rather than as healed', async () => {
    state.breaches = [breach(1), breach(2)]
    // The view still reports order-2 afterwards: the write did not take.
    state.breachesAfter = [breach(2)]

    const result = await healUnrecordedOrders()

    expect(result.attempted).toBe(2)
    expect(result.healed).toBe(1)
    expect(result.unhealed).toEqual(['EL-REF2'])
  })

  it('does not trust the resolver: every repair is counted healed only after the view agrees', async () => {
    state.breaches = [breach(1)]
    // The resolver returns null for every call in this suite, which is what it
    // returns when it caught an error. The view is what decides.
    state.breachesAfter = []

    const result = await healUnrecordedOrders()

    expect(result.healed).toBe(1)
    expect(result.unhealed).toEqual([])
  })
})

describe('the backstop leaves the resolution race alone', () => {
  it('skips an order inside the grace window and says how many it skipped', async () => {
    state.breaches = [breach(1), breach(2), breach(3)]
    state.youngOrderIds = ['order-2', 'order-3']
    state.breachesAfter = [breach(2), breach(3)]

    const result = await healUnrecordedOrders()

    expect(state.resolveCalls).toEqual(['order-1'])
    expect(result.unrecorded).toBe(3)
    expect(result.withinGrace).toBe(2)
    expect(result.attempted).toBe(1)
    expect(result.healed).toBe(1)
    // The two it deliberately left alone are NOT reported as failures.
    expect(result.unhealed).toEqual([])
  })

  it('attempts nothing when every unrecorded order is still inside the window', async () => {
    state.breaches = [breach(1)]
    state.youngOrderIds = ['order-1']
    state.breachesAfter = [breach(1)]

    const result = await healUnrecordedOrders()

    expect(state.resolveCalls).toEqual([])
    expect(result.withinGrace).toBe(1)
    expect(result.attempted).toBe(0)
    expect(result.healed).toBe(0)
  })

  it('reads the grace window from the one constant the build guard also reads', () => {
    expect(RESOLUTION_GRACE_MS).toBeGreaterThan(0)
    const source = readFileSync(join(process.cwd(), 'src/lib/attribution/backstop.ts'), 'utf8')
    // The guard reads this literal out of this file. If it stops being a
    // literal the guard refuses to run, so the shape is part of the contract.
    expect(source).toMatch(/export const RESOLUTION_GRACE_MS\s*=\s*[0-9][0-9*\s]*/)
  })
})

describe('the backstop never reports success when it could not look', () => {
  it('throws when the breaches view cannot be read', async () => {
    state.breachReadFails = 'connection terminated'

    // The wording moved when this read was paged on 19 September 2026; the
    // contract did not. It still throws rather than reporting an empty heal,
    // and it still names the view, which is what an operator greps for.
    await expect(healUnrecordedOrders()).rejects.toThrow(
      /marketing_attribution_invariant_breaches could not be read in full: connection terminated/,
    )
  })

  it('throws when the orders read that decides the grace split fails', async () => {
    state.breaches = [breach(1)]
    state.ordersReadFails = 'connection terminated'

    await expect(healUnrecordedOrders()).rejects.toThrow(/orders read failed/)
    // And it repaired nothing on the way out: a partial pass reported as a
    // failure is recoverable, a partial pass reported as a success is not.
    expect(state.resolveCalls).toEqual([])
  })
})

describe('the backstop is bounded, and says when it hit the bound', () => {
  it('repairs at most one run-worth and reports capped, so a backlog is visible', async () => {
    state.breaches = Array.from({ length: BACKSTOP_MAX_PER_RUN + 5 }, (_, i) => breach(i))
    state.breachesAfter = []

    const result = await healUnrecordedOrders()

    expect(result.unrecorded).toBe(BACKSTOP_MAX_PER_RUN + 5)
    expect(result.attempted).toBe(BACKSTOP_MAX_PER_RUN)
    expect(state.resolveCalls).toHaveLength(BACKSTOP_MAX_PER_RUN)
    expect(result.capped).toBe(true)
  })

  it('does not report capped when the work fits in one run', async () => {
    state.breaches = Array.from({ length: BACKSTOP_MAX_PER_RUN }, (_, i) => breach(i))
    state.breachesAfter = []

    const result = await healUnrecordedOrders()

    expect(result.attempted).toBe(BACKSTOP_MAX_PER_RUN)
    expect(result.capped).toBe(false)
  })
})

describe('the cron route that drives it', () => {
  const route = readFileSync(join(process.cwd(), 'src/app/api/cron/attribution-backstop/route.ts'), 'utf8')

  it('refuses an unauthorised caller before it reads anything', () => {
    expect(route).toContain('requireCronAuth')
    expect(route.indexOf('requireCronAuth')).toBeLessThan(route.indexOf('healUnrecordedOrders'))
  })

  it('answers 500 rather than an empty success when the repair throws', () => {
    expect(route).toMatch(/catch[\s\S]*status:\s*500/)
  })

  it('is on a schedule, because a cron that is never invoked looks like one with nothing to do', () => {
    const crons = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')).crons as { path: string }[]
    expect(crons.some(c => c.path === '/api/cron/attribution-backstop')).toBe(true)
  })
})

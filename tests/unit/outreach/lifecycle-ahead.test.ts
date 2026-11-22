import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * LAW 49's LETTERS DRAFTED THE NIGHT BEFORE (the PM's 13:40 of 22 November 2026, on Lawal's order that each day's ten
 * are queued by 05:55 and any shortfall refilled the night before): from 23:30 a law 49 play drafts the morning's letters,
 * slotted from the window's 06:00 opening, and its cap counts the letters SCHEDULED for that morning, so the window's own
 * runs never draft ten more. The planner is driven here against a stand-in database; the drafter is stood in, so what is
 * judged is what the planner asks of it and when.
 */

const calls = vi.hoisted(() => ({ drafts: [] as { contactId: string; scheduledFor: Date; now: Date }[] }))
vi.mock('@/lib/outreach/lifecycle-play', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/outreach/lifecycle-play')>()),
  draftLifecycleLetter: vi.fn(async (_db: unknown, input: { contactId: string; scheduledFor: Date; now: Date }) => {
    calls.drafts.push({ contactId: input.contactId, scheduledFor: input.scheduledFor, now: input.now })
    return { state: 'queued', touchId: `t-${input.contactId}` }
  }),
}))

const { planPlays } = await import('@/lib/outreach/planner')
const { lifecycleSlotBase } = await import('@/lib/outreach/lifecycle-play')

type Query = { table: string; head: boolean; filters: [string, string, unknown][] }

/** A stand-in database for one approved law 49 offer play and two contacts, with a given count already scheduled. */
function fakeDb(scheduledAlready: number) {
  const queries: Query[] = []
  const answer = (q: Query): { data?: unknown; count?: number; error: null } => {
    if (q.table === 'outreach_plays') {
      return { data: [{ id: 'p1', name: 'Law 49: the free promotion offer', cohort_rule: {}, step1_template_id: 'tpl', step2_template_id: null, step3_template_id: null, variant_template_id: null, test_per_half: null }], error: null }
    }
    if (q.table === 'outreach_templates') return { data: [{ id: 'tpl', key: 'lifecycle_acq' }], error: null }
    if (q.table === 'outreach_touches' && q.head) return { count: scheduledAlready, error: null }
    if (q.table === 'outreach_touches') return { data: [], error: null }
    if (q.table === 'organiser_contacts') {
      return {
        data: [
          { id: 'c1', organiser_id: 'o1', address: 'info@first.example', person_name: null },
          { id: 'c2', organiser_id: 'o2', address: 'info@second.example', person_name: null },
        ],
        error: null,
      }
    }
    return { data: null, error: null }
  }
  const from = (table: string) => {
    const q: Query = { table, head: false, filters: [] }
    queries.push(q)
    const b: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'in', 'gte', 'lt', 'lte', 'order', 'limit', 'is', 'not']) {
      b[m] = (column: string, value: unknown) => (q.filters.push([m, column, value]), b)
    }
    b.select = (_cols: string, opts?: { head?: boolean }) => ((q.head = opts?.head === true), b)
    b.single = async () => answer(q)
    b.maybeSingle = async () => answer(q)
    b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(answer(q)).then(ok, bad)
    return b
  }
  const db = { from, rpc: async () => ({ data: 10, error: null }) }
  return { db: db as never, queries }
}

const run = (db: never, now: Date) => planPlays(db, { now, origin: 'https://www.eventlinqs.com.au', actingUser: 'u' })

// Melbourne is on daylight time (+11:00) in late November 2026.
const SUN_2200 = new Date('2026-11-22T11:00:00Z')
const SUN_2330 = new Date('2026-11-22T12:30:00Z')
const SUN_2345 = new Date('2026-11-22T12:45:00Z')
const MON_0600 = new Date('2026-11-22T19:00:00Z')
const MON_0700 = new Date('2026-11-22T20:00:00Z')
const MON_1000 = new Date('2026-11-22T23:00:00Z')
const SAT_2330 = new Date('2026-11-21T12:30:00Z')
const FRI_2345 = new Date('2026-11-27T12:45:00Z')
const SAT_0600 = new Date('2026-11-27T19:00:00Z')

describe('when a law 49 play drafts, and from which moment (lifecycleSlotBase)', () => {
  it('inside the window it drafts now', () => {
    expect(lifecycleSlotBase(MON_0700)).toEqual(MON_0700)
  })
  it('from 23:30 the night before a window it drafts for the window\'s 06:00 opening', () => {
    expect(lifecycleSlotBase(SUN_2330)).toEqual(MON_0600)
    expect(lifecycleSlotBase(FRI_2345)).toEqual(SAT_0600)
  })
  it('before 23:30, after the window, and on a night before a day off it drafts nothing', () => {
    expect(lifecycleSlotBase(SUN_2200)).toBeNull()
    expect(lifecycleSlotBase(new Date(SUN_2330.getTime() - 60_000))).toBeNull()
    expect(lifecycleSlotBase(MON_1000)).toBeNull()
    expect(lifecycleSlotBase(SAT_2330)).toBeNull()
  })
})

describe("the planner drafts the morning's law 49 letters the night before, within the morning's ten", () => {
  beforeEach(() => {
    calls.drafts = []
  })

  it('at 23:30 each letter is drafted for Monday, slotted from 06:00, ten minutes apart', async () => {
    const { db, queries } = fakeDb(0)
    const [report] = await run(db, SUN_2330)
    expect(calls.drafts.map((d) => [d.contactId, d.scheduledFor.toISOString()])).toEqual([
      ['c1', '2026-11-22T19:00:00.000Z'],
      ['c2', '2026-11-22T19:10:00.000Z'],
    ])
    expect(report.queued).toBe(2)
    // The cap counts what is SCHEDULED for Monday (Melbourne's Monday: 13:00Z to 13:00Z), not what was drafted on Sunday.
    const count = queries.find((q) => q.table === 'outreach_touches' && q.head)!
    expect(count.filters).toContainEqual(['gte', 'scheduled_for', '2026-11-22T13:00:00.000Z'])
    expect(count.filters).toContainEqual(['lt', 'scheduled_for', '2026-11-23T13:00:00.000Z'])
    expect(count.filters.some(([, column]) => column === 'drafted_at')).toBe(false)
  })

  it('a refill at 23:45 slots after the letters already scheduled, and stops at the ten', async () => {
    const { db } = fakeDb(9)
    await run(db, SUN_2345)
    expect(calls.drafts.map((d) => d.scheduledFor.toISOString())).toEqual(['2026-11-22T20:30:00.000Z'])
  })

  it("at 07:00 on Monday the ten drafted the night before are counted, so none is drafted again", async () => {
    const { db } = fakeDb(10)
    await run(db, MON_0700)
    expect(calls.drafts).toEqual([])
  })

  it('inside the window with room it drafts as before, from now', async () => {
    const { db } = fakeDb(0)
    await run(db, MON_0700)
    expect(calls.drafts[0].scheduledFor.toISOString()).toBe(MON_0700.toISOString())
  })

  it('at 22:00 on Sunday, before the night turn, nothing is drafted', async () => {
    const { db } = fakeDb(0)
    const [report] = await run(db, SUN_2200)
    expect(calls.drafts).toEqual([])
    expect(report.queued).toBe(0)
  })
})

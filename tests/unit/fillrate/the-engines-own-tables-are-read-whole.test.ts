import { describe, expect, test } from 'vitest'
import { factsFor, holdsOn } from '@/lib/fillrate/read'
import { proofForSlot } from '@/lib/fillrate/proof'

/**
 * THE RECOVERY ENGINE'S OWN TABLES ARE READ WHOLE, OR THE ENGINE DOES IT AGAIN.
 *
 * ---------------------------------------------------------------------------
 * Three tables answer the same question, "has this person already had this from
 * us", and all three fail the same way when a read stops short: they
 * UNDER-REPORT what has already been done, so the engine repeats it.
 *
 *   recovery_suppressions   held since LB-RECOVERYSTOP
 *   recovery_sends          a name missing from it is somebody written to twice
 *   recovery_holds          a hold missing from it is a held seat offered twice
 *
 * Supabase caps one response at a fixed number of rows, 1,000 by default
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * Measured against the TEST project on 20 September 2026:
 *
 *     Prefer: count=exact    HTTP 206   Content-Range: 0-999/14381
 *     no count requested     HTTP 200   Content-Range: 0-999/*
 *
 * AND THIS ONE IS CLOSE. These reads filter by slot, so the cliff is a thousand
 * rows on ONE slot, and the busiest slot on TEST already carries 452 sends.
 * Three messages to three hundred and fifty abandoners crosses it.
 */

type Row = Record<string, unknown>

/**
 * A database that answers a window and never volunteers that there is more,
 * exactly as PostgREST does. Unpaged reads resolve whole, because the two
 * `ledger_entries` reads in the proof belong to another lane and were not
 * changed by this item.
 */
function pagingDb({
  tables = {} as Record<string, Row[]>,
  pageCeiling = 1000,
  failOn = null as null | string,
}) {
  const pages: Record<string, number[]> = {}

  const chainFor = (table: string) => {
    const rows = tables[table] ?? []
    const answer = () =>
      failOn === table ? { data: null, error: { message: `${table} went away` } } : { data: rows, error: null }

    const ranged = {
      order: () => ranged,
      range: async (from: number, to: number) => {
        if (failOn === table) return { data: null, error: { message: `${table} went away` } }
        const window = rows.slice(from, Math.min(to + 1, from + pageCeiling))
        ;(pages[table] ??= []).push(window.length)
        return { data: window, error: null }
      },
    }

    const chain: Record<string, unknown> = {
      order: () => ranged,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(answer()).then(resolve),
    }
    chain.eq = () => chain
    chain.in = () => chain
    chain.not = () => chain
    return chain
  }

  return {
    db: { from: (table: string) => ({ select: () => chainFor(table) }) } as never,
    pages,
  }
}

const SLOT = 'slot-1'

function sends(n: number, email = 'buyer@example.test'): Row[] {
  return Array.from({ length: n }, (_unused, i) => ({
    contact_email: email,
    message_number: (i % 3) + 1,
    sent_at: '2026-09-01T00:00:00.000Z',
  }))
}

function holds(n: number): Row[] {
  return Array.from({ length: n }, (_unused, i) => ({
    id: i + 1,
    demand_entry_id: i + 1,
    contact_email: `waiter-${i}@example.test`,
    inventory_class: null,
    units: 1,
    expires_at: '2026-12-01T00:00:00.000Z',
    claimed_at: null,
    released_at: null,
  }))
}

describe('factsFor: everything the engine has already sent on this slot', () => {
  test('a slot inside one page behaves as it always did', async () => {
    const { db } = pagingDb({
      tables: { ledger_entries: [], recovery_sends: sends(3) },
    })
    const facts = await factsFor(SLOT, db)
    expect(facts.alreadySent.size).toBe(3)
  })

  test('THE DEFECT: 2,500 sends past a 1,000-row ceiling are all remembered', async () => {
    const many = Array.from({ length: 2500 }, (_unused, i) => ({
      contact_email: `person-${i}@example.test`,
      message_number: 1,
      sent_at: '2026-09-01T00:00:00.000Z',
    }))
    const { db, pages } = pagingDb({ tables: { ledger_entries: [], recovery_sends: many }, pageCeiling: 1000 })

    const facts = await factsFor(SLOT, db)

    expect(facts.alreadySent.size).toBe(2500)
    // The 1,001st person is the one who would have been written to twice.
    expect(facts.alreadySent.has('person-1500@example.test::1')).toBe(true)
    expect(pages.recovery_sends).toEqual([1000, 1000, 500, 0])
  })

  test('a ceiling LOWER than the page size is still read in full', async () => {
    const many = Array.from({ length: 1200 }, (_unused, i) => ({
      contact_email: `person-${i}@example.test`,
      message_number: 2,
      sent_at: '2026-09-01T00:00:00.000Z',
    }))
    const { db } = pagingDb({ tables: { ledger_entries: [], recovery_sends: many }, pageCeiling: 250 })
    const facts = await factsFor(SLOT, db)
    expect(facts.alreadySent.size).toBe(1200)
  })

  test('a send-log read that FAILS raises rather than reporting that nothing was sent', async () => {
    const { db } = pagingDb({ tables: { ledger_entries: [] }, failOn: 'recovery_sends' })
    await expect(factsFor(SLOT, db)).rejects.toThrow(/already sent/)
  })
})

describe('holdsOn: every hold on the slot, live or lapsed', () => {
  test('THE DEFECT: 1,500 holds past the ceiling are all seen', async () => {
    const { db } = pagingDb({ tables: { recovery_holds: holds(1500) }, pageCeiling: 1000 })
    const rows = await holdsOn(SLOT, db)
    expect(rows).toHaveLength(1500)
  })

  test('a holds read that FAILS raises rather than reporting a slot with nothing held', async () => {
    const { db } = pagingDb({ tables: {}, failOn: 'recovery_holds' })
    await expect(holdsOn(SLOT, db)).rejects.toThrow(/holds on slot-1/)
  })
})

describe('proofForSlot: the number somebody would switch the engine off over', () => {
  test('the sends it reports are paged, so a recovery past the ceiling still counts', async () => {
    const { db, pages } = pagingDb({
      tables: { ledger_entries: [], recovery_sends: sends(1500, 'buyer@example.test'), recovery_holds: [] },
      pageCeiling: 1000,
    })
    const proof = await proofForSlot(SLOT, db)
    expect(proof.emailed).toBe(1500)
    expect(pages.recovery_sends).toEqual([1000, 500, 0])
  })

  test('the holds it reports are paged too', async () => {
    const { db } = pagingDb({
      tables: { ledger_entries: [], recovery_sends: [], recovery_holds: holds(1200) },
      pageCeiling: 1000,
    })
    const proof = await proofForSlot(SLOT, db)
    expect(proof.offered).toBe(1200)
  })

  test('THE SILENCE: a failed ledger read used to render a proof of zero, and now raises', async () => {
    const { db } = pagingDb({
      tables: { recovery_sends: [], recovery_holds: [] },
      failOn: 'ledger_entries',
    })
    await expect(proofForSlot(SLOT, db)).rejects.toThrow(/could not read the (abandonments|sales)/)
  })

  test('a failed send-log read raises as well, rather than reporting nothing emailed', async () => {
    const { db } = pagingDb({
      tables: { ledger_entries: [], recovery_holds: [] },
      failOn: 'recovery_sends',
    })
    await expect(proofForSlot(SLOT, db)).rejects.toThrow(/recovery sends on slot-1/)
  })
})

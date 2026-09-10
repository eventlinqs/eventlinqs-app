/**
 * THE BACKFILL. Close-out D1: "Backfill from existing completed orders through
 * the same adapter. Backfill only what was genuinely recorded. Invent nothing."
 *
 * Three claims are worth testing and all three are tested here:
 *   1. it REFUSES to write to production unless the owner has said so;
 *   2. a re-run writes nothing twice, so it is safe to run again after a
 *      failure, which is the state a backfill is most often in;
 *   3. it invents nothing: an add-on is not a sold place, and no demand row is
 *      ever backfilled, because nobody recorded who reached checkout before the
 *      ledger existed and writing zero abandonment for an unmeasured period
 *      would be a lie the recovery engine would then act on.
 */
import { describe, expect, test, vi } from 'vitest'
import { backfillOrder, judgeBackfillTarget } from '../../../scripts/ops/backfill-slot-ledger.mjs'

const PRODUCTION = 'https://gndnldyfudbytbboxesk.supabase.co'
const TEST_PROJECT = 'https://vkapkibzokmfaxqogypq.supabase.co'

describe('what it will and will not write to', () => {
  test('refuses to write to production, and says why in a sentence a person can act on', () => {
    const verdict = judgeBackfillTarget({ url: PRODUCTION, dryRun: false })
    expect(verdict.allowed).toBe(false)
    expect(verdict.reason).toContain('PRODUCTION')
    expect(verdict.reason).toContain('approval')
  })

  test('reading production without writing to it is allowed, because that is how the plan is checked', () => {
    expect(judgeBackfillTarget({ url: PRODUCTION, dryRun: true }).allowed).toBe(true)
  })

  test('the TEST project is allowed, which is where a backfill is proven before it is ever run for real', () => {
    expect(judgeBackfillTarget({ url: TEST_PROJECT, dryRun: false }).allowed).toBe(true)
  })

  test('a target it cannot read at all is not silently treated as production', () => {
    expect(judgeBackfillTarget({ url: undefined, dryRun: false }).allowed).toBe(true)
  })
})

/** The slice of the client the backfill reads, over rows held in memory. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      let rows = tables[table] ?? []
      const api = {
        select: () => api,
        eq: (column: string, value: unknown) => {
          rows = rows.filter(r => r[column] === value)
          return api
        },
        in: (column: string, values: unknown[]) => {
          rows = rows.filter(r => values.includes(r[column]))
          return api
        },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      }
      return api
    },
  }
}

const ORDER = { id: 'order-1', order_number: 'EL-TESTORDER', confirmed_at: '2026-06-12T09:00:00.000Z' }

describe('a dry run, which is the only mode that may be pointed at production', () => {
  test('reports the ticket lines it would write, at the price recorded on them', async () => {
    const db = fakeDb({
      order_items: [
        { id: 'item-1', order_id: 'order-1', item_type: 'ticket', item_name: 'Early bird', quantity: 2, total_cents: 9000 },
      ],
      ledger_entries: [],
    })
    const tally = await backfillOrder({ db, order: ORDER, adapter: {}, dryRun: true })
    expect(tally.written).toBe(1)
    expect(tally.alreadyThere).toBe(0)
    expect(tally.wouldWrite[0]).toContain('EL-TESTORDER')
    expect(tally.wouldWrite[0]).toContain('Early bird x2')
    expect(tally.wouldWrite[0]).toContain('90.00')
  })

  test('an ADD-ON is not a sold place, so it is not in the plan either', async () => {
    const db = fakeDb({
      order_items: [
        { id: 'item-1', order_id: 'order-1', item_type: 'ticket', item_name: 'General', quantity: 1, total_cents: 6000 },
        { id: 'item-2', order_id: 'order-1', item_type: 'addon', item_name: 'Parking', quantity: 1, total_cents: 1500 },
      ],
      ledger_entries: [],
    })
    const tally = await backfillOrder({ db, order: ORDER, adapter: {}, dryRun: true })
    expect(tally.written).toBe(1)
    expect(tally.wouldWrite.join(' ')).not.toContain('Parking')
  })

  test('a line already in the ledger is counted as already there, so a re-run is honest about doing nothing', async () => {
    const db = fakeDb({
      order_items: [
        { id: 'item-1', order_id: 'order-1', item_type: 'ticket', item_name: 'General', quantity: 1, total_cents: 6000 },
      ],
      ledger_entries: [{ occurrence_key: 'sale:item-1' }],
    })
    const tally = await backfillOrder({ db, order: ORDER, adapter: {}, dryRun: true })
    expect(tally).toMatchObject({ written: 0, alreadyThere: 1, wouldWrite: [] })
  })

  test('writes NOTHING, whatever it found: the adapter is never called in a dry run', async () => {
    const adapter = { recordConfirmedOrder: vi.fn(), recordRefundedOrder: vi.fn() }
    const db = fakeDb({
      order_items: [
        { id: 'item-1', order_id: 'order-1', item_type: 'ticket', item_name: 'General', quantity: 1, total_cents: 6000 },
      ],
      ledger_entries: [],
    })
    await backfillOrder({ db, order: ORDER, adapter, dryRun: true })
    expect(adapter.recordConfirmedOrder).not.toHaveBeenCalled()
    expect(adapter.recordRefundedOrder).not.toHaveBeenCalled()
  })
})

describe('a real run', () => {
  test('goes through the same adapter a live sale goes through, and never round it', async () => {
    const adapter = {
      recordConfirmedOrder: vi.fn(async () => ({ written: 2, failed: 0 })),
      recordRefundedOrder: vi.fn(async () => ({ written: 1, failed: 0 })),
    }
    const db = fakeDb({ refunds: [{ id: 'refund-1', order_id: 'order-1' }] })

    const tally = await backfillOrder({ db, order: ORDER, adapter, dryRun: false })

    expect(adapter.recordConfirmedOrder).toHaveBeenCalledWith('order-1')
    expect(adapter.recordRefundedOrder).toHaveBeenCalledWith('refund-1')
    expect(tally).toMatchObject({ written: 3, failed: 0 })
  })

  test('carries every refund on the order, so a backfilled slot is not richer than it was', async () => {
    const adapter = {
      recordConfirmedOrder: vi.fn(async () => ({ written: 1, failed: 0 })),
      recordRefundedOrder: vi.fn(async () => ({ written: 1, failed: 0 })),
    }
    const db = fakeDb({
      refunds: [
        { id: 'refund-1', order_id: 'order-1' },
        { id: 'refund-2', order_id: 'order-1' },
        { id: 'refund-3', order_id: 'another-order' },
      ],
    })
    await backfillOrder({ db, order: ORDER, adapter, dryRun: false })
    expect(adapter.recordRefundedOrder).toHaveBeenCalledTimes(2)
  })

  test('reports a row it could not write rather than counting it as done', async () => {
    const adapter = {
      recordConfirmedOrder: vi.fn(async () => ({ written: 0, failed: 1 })),
      recordRefundedOrder: vi.fn(),
    }
    const tally = await backfillOrder({ db: fakeDb({ refunds: [] }), order: ORDER, adapter, dryRun: false })
    expect(tally).toMatchObject({ written: 0, failed: 1 })
  })
})

describe('what it never backfills', () => {
  test('no demand row, ever: nobody recorded who reached checkout before the ledger existed', async () => {
    const source = String(
      await import('node:fs').then(fs =>
        fs.readFileSync(new URL('../../../scripts/ops/backfill-slot-ledger.mjs', import.meta.url), 'utf8'),
      ),
    )
    expect(source).not.toContain('recordDemand')
    expect(source).toContain('NO demand rows are backfilled')
  })
})

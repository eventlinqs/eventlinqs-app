import { afterEach, describe, expect, test, vi } from 'vitest'
import { PRICE_HISTORY_SELECT, readPriceHistory, type PriceHistoryClient } from '@/lib/pricing/read-price-history'

/**
 * The one reader of ticket_price_history. A failure yields no history and a
 * named log line, never a thrown error and never silence: the ticket panel
 * must not go down with a missing table, and a missing table must be readable
 * in the server log as exactly that.
 */
function reader(answer: { data: unknown; error: { code?: string; message: string } | null }) {
  const calls: { table?: string; columns?: string; eq?: [string, string]; order?: [string, { ascending: boolean }] } = {}
  const stub = {
    from(table: string) {
      calls.table = table
      return {
        select(columns: string) {
          calls.columns = columns
          return {
            eq(column: string, value: string) {
              calls.eq = [column, value]
              return {
                order(column2: string, options: { ascending: boolean }) {
                  calls.order = [column2, options]
                  return Promise.resolve(answer)
                },
              }
            },
          }
        },
      }
    },
  }
  const client = stub as unknown as PriceHistoryClient
  return { client, calls }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readPriceHistory', () => {
  test('asks for the event rows oldest first with the one column list', async () => {
    const rows = [{ id: 'a', tier_name: 'GA', price_cents: 3000, reason: 'listed', recorded_at: '2026-09-01T00:00:00Z' }]
    const { client, calls } = reader({ data: rows, error: null })
    const out = await readPriceHistory(client, 'event-1')
    expect(out).toEqual(rows)
    expect(calls.table).toBe('ticket_price_history')
    expect(calls.columns).toBe(PRICE_HISTORY_SELECT)
    expect(calls.eq).toEqual(['event_id', 'event-1'])
    expect(calls.order).toEqual(['recorded_at', { ascending: true }])
  })

  test('a failed read logs the code and yields no history rather than throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = reader({ data: null, error: { code: 'PGRST205', message: 'relation not found' } })
    const out = await readPriceHistory(client, 'event-1')
    expect(out).toEqual([])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0][1]).toMatchObject({ eventId: 'event-1', code: 'PGRST205' })
  })

  test('a null data with no error is an empty history', async () => {
    const { client } = reader({ data: null, error: null })
    expect(await readPriceHistory(client, 'event-1')).toEqual([])
  })

  test('the column list carries everything the summariser reads', () => {
    for (const col of ['id', 'ticket_tier_id', 'tier_name', 'price_cents', 'previous_price_cents', 'reason', 'percent_sold', 'currency', 'recorded_at']) {
      expect(PRICE_HISTORY_SELECT).toContain(col)
    }
  })
})

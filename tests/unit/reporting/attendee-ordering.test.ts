import { describe, expect, test } from 'vitest'
import {
  byTicketReadingOrder,
  byOrderReadingOrder,
  earliestScanPerTicket,
} from '@/lib/reporting/ordering'

/**
 * THE ORDER THE DATABASE USED TO CHOOSE, NOW CHOSEN HERE WHERE IT CAN BE ARGUED
 * WITH.
 *
 * Every read behind the organiser's attendee list, door list and orders report
 * asked the database for its display order and read the answer unbounded. That
 * is two jobs in one call, and the second one silently broke the first:
 * Supabase caps a response at 1,000 rows without saying so, so the database was
 * choosing the order AND choosing who to leave out.
 *
 * Paging fixes the truncation and takes the ordering away, because a ranged
 * read has to page on a UNIQUE column or its windows are undefined. So the
 * reads page on the primary key and the reading order is restored by these
 * three functions. If they are wrong, the door list is in the wrong order and
 * nothing else on the platform would notice, which is exactly why they are pure
 * and tested here rather than left inline in a server component.
 */

describe('byTicketReadingOrder: oldest ticket first, and never a tie', () => {
  test('orders oldest first, which is the order the door list has always read in', () => {
    const rows = [
      { created_at: '2026-09-03T00:00:00.000Z', ticket_code: 'EL-C' },
      { created_at: '2026-09-01T00:00:00.000Z', ticket_code: 'EL-A' },
      { created_at: '2026-09-02T00:00:00.000Z', ticket_code: 'EL-B' },
    ]
    expect([...rows].sort(byTicketReadingOrder).map(r => r.ticket_code)).toEqual([
      'EL-A',
      'EL-B',
      'EL-C',
    ])
  })

  /**
   * THE TIEBREAK IS NOT DECORATION. Two tickets sold in the same second arrive
   * from a paged read in PRIMARY KEY order, and the key is a uuid, so without a
   * tiebreak their order is effectively random and the printed door list
   * reshuffles them on every load. A door list is a document somebody reads
   * down while a queue waits.
   */
  test('two tickets sold in the same second still have one defined order', () => {
    const same = '2026-09-01T00:00:00.000Z'
    const rows = [
      { created_at: same, ticket_code: 'EL-ZZZZ' },
      { created_at: same, ticket_code: 'EL-AAAA' },
      { created_at: same, ticket_code: 'EL-MMMM' },
    ]
    const once = [...rows].sort(byTicketReadingOrder).map(r => r.ticket_code)
    const twice = [...rows].reverse().sort(byTicketReadingOrder).map(r => r.ticket_code)
    expect(once).toEqual(['EL-AAAA', 'EL-MMMM', 'EL-ZZZZ'])
    expect(twice).toEqual(once)
  })

  test('a null created_at sorts first rather than throwing', () => {
    const rows = [
      { created_at: '2026-09-01T00:00:00.000Z', ticket_code: 'EL-B' },
      { created_at: null, ticket_code: 'EL-A' },
    ]
    expect([...rows].sort(byTicketReadingOrder).map(r => r.ticket_code)).toEqual(['EL-A', 'EL-B'])
  })

  test('the comparator is total: no two distinct rows compare equal', () => {
    const rows = [
      { created_at: '2026-09-01T00:00:00.000Z', ticket_code: 'EL-A' },
      { created_at: '2026-09-01T00:00:00.000Z', ticket_code: 'EL-B' },
      { created_at: '2026-09-02T00:00:00.000Z', ticket_code: 'EL-A' },
    ]
    for (const a of rows) {
      for (const b of rows) {
        if (a === b) continue
        expect(byTicketReadingOrder(a, b)).not.toBe(0)
      }
    }
  })
})

describe('byOrderReadingOrder: newest order first, and never a tie', () => {
  test('orders newest first, which is what both order surfaces have always shown', () => {
    const rows = [
      { created_at: '2026-09-01T00:00:00.000Z', order_number: 'EL-1' },
      { created_at: '2026-09-03T00:00:00.000Z', order_number: 'EL-3' },
      { created_at: '2026-09-02T00:00:00.000Z', order_number: 'EL-2' },
    ]
    expect([...rows].sort(byOrderReadingOrder).map(r => r.order_number)).toEqual([
      'EL-3',
      'EL-2',
      'EL-1',
    ])
  })

  test('two orders placed in the same second still have one defined order', () => {
    const same = '2026-09-01T00:00:00.000Z'
    const rows = [
      { created_at: same, order_number: 'EL-9' },
      { created_at: same, order_number: 'EL-1' },
    ]
    const once = [...rows].sort(byOrderReadingOrder).map(r => r.order_number)
    expect(once).toEqual(['EL-1', 'EL-9'])
    expect([...rows].reverse().sort(byOrderReadingOrder).map(r => r.order_number)).toEqual(once)
  })
})

describe('earliestScanPerTicket: the FIRST sync wins, and it has to be the first', () => {
  /**
   * THE DEFECT THIS REPLACED. The read had no `order by` and the loop kept the
   * first row it happened to meet, so the admission shown as having "won" a
   * double-scan was whichever one Postgres returned first. That is undefined,
   * and it could differ between two loads of the same page: the organiser was
   * handed a door and a time, presented as the scan that beat this one, that
   * need not have been either.
   */
  test('the earliest sync wins no matter what order the rows arrive in', () => {
    const rows = [
      { id: 'scan-late', ticket_id: 't1', scanned_at: '2026-09-01T20:05:00.000Z' },
      { id: 'scan-first', ticket_id: 't1', scanned_at: '2026-09-01T20:01:00.000Z' },
      { id: 'scan-middle', ticket_id: 't1', scanned_at: '2026-09-01T20:03:00.000Z' },
    ]
    expect(earliestScanPerTicket(rows).get('t1')?.id).toBe('scan-first')
    expect(earliestScanPerTicket([...rows].reverse()).get('t1')?.id).toBe('scan-first')
  })

  test('the row order the old code depended on no longer changes the answer', () => {
    const rows = [
      { id: 'b', ticket_id: 't1', scanned_at: '2026-09-01T20:09:00.000Z' },
      { id: 'a', ticket_id: 't1', scanned_at: '2026-09-01T20:02:00.000Z' },
    ]
    // The old code took rows[0]. Every permutation must now answer the same.
    const permutations = [rows, [...rows].reverse()]
    for (const p of permutations) {
      expect(earliestScanPerTicket(p).get('t1')?.id).toBe('a')
    }
  })

  test('each ticket gets its own winner', () => {
    const winners = earliestScanPerTicket([
      { id: 's1', ticket_id: 't1', scanned_at: '2026-09-01T20:05:00.000Z' },
      { id: 's2', ticket_id: 't2', scanned_at: '2026-09-01T20:01:00.000Z' },
      { id: 's3', ticket_id: 't1', scanned_at: '2026-09-01T20:02:00.000Z' },
    ])
    expect(winners.get('t1')?.id).toBe('s3')
    expect(winners.get('t2')?.id).toBe('s2')
    expect(winners.size).toBe(2)
  })

  test('a scan with no ticket is skipped rather than keyed on null', () => {
    const winners = earliestScanPerTicket([
      { id: 's1', ticket_id: null, scanned_at: '2026-09-01T20:00:00.000Z' },
      { id: 's2', ticket_id: undefined, scanned_at: '2026-09-01T20:00:00.000Z' },
    ])
    expect(winners.size).toBe(0)
  })

  test('two syncs recorded in the same instant fall through to the scan id', () => {
    const same = '2026-09-01T20:00:00.000Z'
    const rows = [
      { id: 'zzz', ticket_id: 't1', scanned_at: same },
      { id: 'aaa', ticket_id: 't1', scanned_at: same },
    ]
    expect(earliestScanPerTicket(rows).get('t1')?.id).toBe('aaa')
    expect(earliestScanPerTicket([...rows].reverse()).get('t1')?.id).toBe('aaa')
  })

  test('a null scanned_at is treated as earliest rather than crashing the panel', () => {
    const winners = earliestScanPerTicket([
      { id: 'timed', ticket_id: 't1', scanned_at: '2026-09-01T20:00:00.000Z' },
      { id: 'untimed', ticket_id: 't1', scanned_at: null },
    ])
    expect(winners.get('t1')?.id).toBe('untimed')
  })
})

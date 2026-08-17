import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  TICKET_SALES_CLOSED_ERROR,
  TICKETS_NOT_ON_SALE_RESERVATION_ERROR,
  tierSaleWindowState,
} from '@/lib/payments/sale-status'

// Mirrors the sale-window gate added to create_reservation by migration
// 20260704000005. The DB function is the authoritative enforcement; these
// tests pin the shared semantics both sides implement.

const NOW = new Date('2026-07-04T10:00:00Z')
const PAST = '2026-07-01T00:00:00Z'
const FUTURE = '2026-07-10T00:00:00Z'

describe('tierSaleWindowState', () => {
  it('is open when both bounds are null', () => {
    expect(tierSaleWindowState({ sale_start: null, sale_end: null }, NOW)).toBe('open')
  })

  it('is not_yet_open before sale_start', () => {
    expect(tierSaleWindowState({ sale_start: FUTURE, sale_end: null }, NOW)).toBe('not_yet_open')
  })

  it('is open after sale_start with no close', () => {
    expect(tierSaleWindowState({ sale_start: PAST, sale_end: null }, NOW)).toBe('open')
  })

  it('is closed after sale_end', () => {
    expect(tierSaleWindowState({ sale_start: null, sale_end: PAST }, NOW)).toBe('closed')
  })

  it('is open inside a bounded window', () => {
    expect(tierSaleWindowState({ sale_start: PAST, sale_end: FUTURE }, NOW)).toBe('open')
  })

  it('is not_yet_open even when sale_end is also in the future', () => {
    expect(
      tierSaleWindowState({ sale_start: '2026-07-05T00:00:00Z', sale_end: FUTURE }, NOW)
    ).toBe('not_yet_open')
  })

  it('treats the exact boundary instants as inside the window', () => {
    expect(
      tierSaleWindowState({ sale_start: NOW.toISOString(), sale_end: NOW.toISOString() }, NOW)
    ).toBe('open')
  })
})

describe('sale-window error copy', () => {
  it('matches the strings returned by create_reservation (migration 20260704000005)', () => {
    expect(TICKET_SALES_CLOSED_ERROR).toBe('Ticket sales for this event have closed.')
  })

  /**
   * THE STRING THIS TEST USED TO PIN IS THE ONE THAT COST A NIGHT.
   *
   * `TICKETS_NOT_ON_SALE_RESERVATION_ERROR` reads "Tickets for this event are not
   * on sale yet." It was returned for THREE unrelated causes, one of which was a
   * failed database read, and it names a sale window. There is no sale-start
   * column on an event in this codebase, so the founder spent hours editing a
   * field that does not exist, sent there by this sentence.
   *
   * The constant is kept exported because migration 20260704000005 still returns
   * it from create_reservation for the genuine tier-window case. What is pinned
   * now is that the SERVER ACTION no longer reaches for it, because the action's
   * refusals are typed and each one says something true.
   */
  it('is no longer the server action\'s answer to every refusal', () => {
    expect(TICKETS_NOT_ON_SALE_RESERVATION_ERROR).toBe('Tickets for this event are not on sale yet.')

    const action = readFileSync(
      path.join(__dirname, '../../../src/app/actions/reservations.ts'),
      'utf8',
    )
    expect(
      action.includes('TICKETS_NOT_ON_SALE_RESERVATION_ERROR'),
      'createReservation must return a TYPED refusal, not the one sentence that ' +
        'meant a payment-setup problem, an external event and a failed read all at once.',
    ).toBe(false)
  })
})

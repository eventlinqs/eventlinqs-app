import { describe, expect, test } from 'vitest'
import {
  eventIsPaid,
  isOrganiserSellable,
  ticketsOnSale,
} from '@/lib/payments/sale-status'

const connected = { stripe_account_id: 'acct_123', stripe_charges_enabled: true }
const notConnected = { stripe_account_id: null, stripe_charges_enabled: false }
const connectedNoCharges = { stripe_account_id: 'acct_123', stripe_charges_enabled: false }

describe('isOrganiserSellable', () => {
  test('true only when connected AND charges enabled', () => {
    expect(isOrganiserSellable(connected)).toBe(true)
    expect(isOrganiserSellable(notConnected)).toBe(false)
    expect(isOrganiserSellable(connectedNoCharges)).toBe(false)
    expect(isOrganiserSellable(null)).toBe(false)
    expect(isOrganiserSellable(undefined)).toBe(false)
  })
})

describe('eventIsPaid', () => {
  test('paid when any tier base price is above zero', () => {
    expect(eventIsPaid([{ price: 0 }, { price: 4500 }])).toBe(true)
    expect(eventIsPaid([{ price: 100 }])).toBe(true)
  })
  test('free when all tiers are zero or there are none', () => {
    expect(eventIsPaid([{ price: 0 }, { price: 0 }])).toBe(false)
    expect(eventIsPaid([])).toBe(false)
  })
})

describe('ticketsOnSale', () => {
  test('free events are always on sale regardless of organiser state', () => {
    expect(ticketsOnSale({ isPaidEvent: false, org: notConnected })).toBe(true)
    expect(ticketsOnSale({ isPaidEvent: false, org: null })).toBe(true)
  })
  test('paid events need a connected, charges-enabled organiser', () => {
    expect(ticketsOnSale({ isPaidEvent: true, org: connected })).toBe(true)
    expect(ticketsOnSale({ isPaidEvent: true, org: notConnected })).toBe(false)
    expect(ticketsOnSale({ isPaidEvent: true, org: connectedNoCharges })).toBe(false)
  })
})

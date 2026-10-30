import { describe, expect, it } from 'vitest'
import { eventPagePromises } from '@/lib/events/event-page-promises'

/**
 * What the event page may promise about the ticket itself (the PROJECT MANAGER's 13:10 of 30 October 2026, the master
 * checklist's L6, M18 and M28): a QR ticket, our refund policy with its booking fee and automatic refunds, and the trust
 * row, only where EventLinqs issues the ticket. Kate Ceberano at Geelong Arts Centre (31 October) is sold on
 * geelongartscentre.org.au with no ticket types here, and her page promised all three.
 */
describe('eventPagePromises', () => {
  it('promises nothing about the ticket on a night sold on another site (Ceberano)', () => {
    expect(
      eventPagePromises({
        entryMode: 'tickets',
        tiers: [],
        isFree: false,
        externalTicketUrl: 'https://www.geelongartscentre.org.au/whats-on/kate-ceberano',
      }),
    ).toEqual({ qrTicket: false, refundPolicy: false, trustSignals: false })
  })

  it('promises nothing on a free registration taken on another site', () => {
    expect(
      eventPagePromises({ tiers: [], isFree: true, externalTicketUrl: 'https://www.humanitix.com/au/events/x' }),
    ).toEqual({ qrTicket: false, refundPolicy: false, trustSignals: false })
  })

  it('promises nothing on a listing night with no price anyone checked', () => {
    expect(eventPagePromises({ tiers: [], isFree: null })).toEqual({ qrTicket: false, refundPolicy: false, trustSignals: false })
  })

  it('promises nothing on a walk-in night, where there is no ticket at all', () => {
    expect(eventPagePromises({ entryMode: 'walk_in', tiers: [], isFree: true })).toEqual({
      qrTicket: false,
      refundPolicy: false,
      trustSignals: false,
    })
  })

  it('promises all three on our own paid tickets', () => {
    expect(eventPagePromises({ tiers: [{ price: 3500, is_active: true }], isFree: false })).toEqual({
      qrTicket: true,
      refundPolicy: true,
      trustSignals: true,
    })
  })

  it('promises all three on our own free registration, which issues a QR ticket', () => {
    expect(eventPagePromises({ tiers: [{ price: 0, is_active: true }], isFree: true })).toEqual({
      qrTicket: true,
      refundPolicy: true,
      trustSignals: true,
    })
  })

  it('keeps the refund policy on our own night once it is over, and drops the door and the trust row', () => {
    expect(eventPagePromises({ over: true, tiers: [{ price: 3500, is_active: true }], isFree: false })).toEqual({
      qrTicket: false,
      refundPolicy: true,
      trustSignals: false,
    })
  })

  it('never reads inactive ticket types as our ticketing', () => {
    expect(eventPagePromises({ tiers: [{ price: 3500, is_active: false }], isFree: null })).toEqual({
      qrTicket: false,
      refundPolicy: false,
      trustSignals: false,
    })
  })
})

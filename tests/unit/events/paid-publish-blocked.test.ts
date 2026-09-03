import { describe, it, expect } from 'vitest'
import { isPaidPublishBlocked } from '@/lib/events/paid-publish-blocked'

/**
 * The Publish button used to look available right up to the press, then be
 * refused server-side. These pin the presentation rule that fixed it, and, more
 * importantly, pin the three ways it must NEVER invent a refusal of its own.
 */
describe('whether the Publish button should look blocked', () => {
  const paid = [{ price: '25.00' }]
  const free = [{ price: '0' }]

  it('blocks a paid event when the organisation cannot sell', () => {
    expect(isPaidPublishBlocked({ canSellPaid: false, editMode: false, tierPrices: paid })).toBe(true)
  })

  it('does not block a FREE event, whatever the organisation can do', () => {
    // Free events bypass the paid gate entirely, so blocking here would stop an
    // organiser publishing something the server would happily accept.
    expect(isPaidPublishBlocked({ canSellPaid: false, editMode: false, tierPrices: free })).toBe(false)
  })

  it('does not block when the organisation CAN sell', () => {
    expect(isPaidPublishBlocked({ canSellPaid: true, editMode: false, tierPrices: paid })).toBe(false)
  })

  it('never blocks in edit mode, so a published paid event stays editable', () => {
    expect(isPaidPublishBlocked({ canSellPaid: false, editMode: true, tierPrices: paid })).toBe(false)
  })

  it('treats a mixed cart as paid, matching the sale gate', () => {
    expect(
      isPaidPublishBlocked({ canSellPaid: false, editMode: false, tierPrices: [{ price: '0' }, { price: '10' }] }),
    ).toBe(true)
  })

  it('treats an unparseable price as free rather than inventing a block', () => {
    // A half-typed price must not flip the button to disabled mid-keystroke.
    expect(isPaidPublishBlocked({ canSellPaid: false, editMode: false, tierPrices: [{ price: '' }] })).toBe(false)
    expect(isPaidPublishBlocked({ canSellPaid: false, editMode: false, tierPrices: [{ price: 'abc' }] })).toBe(false)
  })

  it('accepts numbers as well as the form strings', () => {
    expect(isPaidPublishBlocked({ canSellPaid: false, editMode: false, tierPrices: [{ price: 25 }] })).toBe(true)
    expect(isPaidPublishBlocked({ canSellPaid: false, editMode: false, tierPrices: [{ price: 0 }] })).toBe(false)
  })

  it('does not block when there are no tiers at all', () => {
    expect(isPaidPublishBlocked({ canSellPaid: false, editMode: false, tierPrices: [] })).toBe(false)
  })
})

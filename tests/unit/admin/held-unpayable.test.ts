import { describe, expect, it } from 'vitest'
import { HELD_UNPAYABLE_LOOK_CENTS, heldUnpayableItems } from '@/lib/admin/today-math'

/**
 * The PM's 15:36 of 14 November 2026: no cap stops an organiser who cannot be paid yet from selling; past A$2,000 held,
 * a person looks. These pin the line: the sum is the ledger's, the threshold is strict, and it names the organisation.
 */
const ORG = { id: 'org-1', name: 'Sunset Sessions' }
const row = (cents: number, at: string) => ({ organisation_id: 'org-1', delta_cents: cents, created_at: at })

describe('ticket sales held for an organisation that cannot be paid yet', () => {
  it('is quiet at or under A$2,000, and speaks above it', () => {
    expect(HELD_UNPAYABLE_LOOK_CENTS).toBe(200_000)
    expect(heldUnpayableItems([ORG], [row(200_000, '2026-11-14T01:00:00Z')])).toEqual([])
    const items = heldUnpayableItems([ORG], [row(150_000, '2026-11-14T01:00:00Z'), row(60_000, '2026-11-14T02:00:00Z')])
    expect(items).toHaveLength(1)
    expect(items[0].what).toBe('Sunset Sessions holds A$2,100.00 in ticket sales with no payout account yet')
    expect(items[0].since).toBe('2026-11-14T01:00:00Z')
    expect(items[0].href).toBe('/admin/organisers')
  })

  it('sums refunds in, as the payout does, so a refunded sale does not raise the line', () => {
    expect(heldUnpayableItems([ORG], [row(250_000, '2026-11-14T01:00:00Z'), row(-100_000, '2026-11-14T03:00:00Z')])).toEqual([])
  })

  it('names only organisations it was given, so a payable organisation never appears', () => {
    expect(heldUnpayableItems([], [row(900_000, '2026-11-14T01:00:00Z')])).toEqual([])
  })
})

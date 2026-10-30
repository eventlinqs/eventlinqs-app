import { describe, expect, it } from 'vitest'
import { soldOutIssue } from '@/lib/social/store'

/*
 * D2 (Lawal's final directive of 30 October 2026, section 2: 'Stop or update campaigns when an event changes, expires,
 * sells out or is cancelled'). pieceDependencies held a scheduled piece for a night unpublished, cancelled, ended or
 * changed, but a night that SOLD OUT after planning still went: only the older post engine's database refusal asked.
 */

const tier = (over: Partial<{ total_capacity: number; sold_count: number; reserved_count: number; is_active: boolean }> = {}) => ({
  total_capacity: 100,
  sold_count: 0,
  reserved_count: 0,
  is_active: true,
  ...over,
})

describe('a scheduled piece and a night that has sold out', () => {
  it('says so when our own tickets are gone', () => {
    expect(soldOutIssue('A night', { ticket_tiers: [tier({ sold_count: 90, reserved_count: 10 })] })).toBe('A night: it has sold out.')
  })
  it('says so when no live link of a listing is still selling', () => {
    expect(soldOutIssue('A night', { event_booking_links: [{ availability: 'sold_out' }] })).toBe('A night: it has sold out.')
  })
  it('says nothing while places remain, or with nothing on record', () => {
    expect(soldOutIssue('A night', { ticket_tiers: [tier({ sold_count: 99 })] })).toBeNull()
    expect(soldOutIssue('A night', { event_booking_links: [{ availability: 'on_sale' }] })).toBeNull()
    expect(soldOutIssue('A night', {})).toBeNull()
  })
})

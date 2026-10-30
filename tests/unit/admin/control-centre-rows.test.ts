import { describe, expect, test } from 'vitest'
import { inventoryFigures } from '@/lib/admin/founder-dashboard-math'

/**
 * THE FOUNDER CONTROL CENTRE'S MISSING ROWS (Lawal's DemandOS directive of 30 October 2026, section 11: "upcoming event
 * inventory", "broken links", "venue partnerships"; the blueprint's section 8: "events happening in the next 7, 14 and
 * 30 days"). Each read by its own count; a count that could not be read is not counted, never 0.
 */

const read = { next7: { value: 59 }, next14: { value: 110 }, next30: { value: 204 }, deadLinks: { value: 0 }, venuePartners: { value: 0 } }

describe('inventory, broken links and venue partnerships on /admin/today', () => {
  test('the nights ahead at 7, 14 and 30 days are daily measures', () => {
    const f = inventoryFigures(read)
    expect(f.slice(0, 3).map((x) => [x.label, x.value, x.cadence, x.kind, x.asksForAPerson])).toEqual([
      ['Public nights in the next 7 days', 59, 'daily', 'measure', false],
      ['Public nights in the next 14 days', 110, 'daily', 'measure', false],
      ['Public nights in the next 30 days', 204, 'daily', 'measure', false],
    ])
  })
  test('a dead booking link on an upcoming night is a failure that asks for a person', () => {
    const dead = inventoryFigures({ ...read, deadLinks: { value: 2 } })[3]
    expect(dead).toMatchObject({ label: 'Booking links found dead on upcoming nights', value: 2, kind: 'failed', cadence: 'daily', asksForAPerson: true, href: '/admin/events' })
  })
  test('venue partners live are a weekly measure, linked to their page', () => {
    expect(inventoryFigures(read)[4]).toMatchObject({ label: 'Venue partners live', value: 0, kind: 'measure', cadence: 'weekly', href: '/admin/partners' })
  })
  test('a count that could not be read is not counted, with its reason', () => {
    const f = inventoryFigures({ ...read, deadLinks: { value: null, note: 'could not be read: timeout' } })[3]
    expect(f.value).toBeNull()
    expect(f.note).toBe('could not be read: timeout')
  })
})

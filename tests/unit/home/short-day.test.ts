import { describe, expect, it } from 'vitest'
import { shortDay } from '@/components/features/home-market/marketplace-home'

// Don't miss reads the row's own day, already in the event's zone; never a Date built in UTC (event-dates-in-the-event-zone).
describe('shortDay', () => {
  it("shortens the row's own day label", () => {
    expect(shortDay('Saturday 21 November')).toBe('Sat 21 Nov')
    expect(shortDay('Sunday 1 March')).toBe('Sun 1 Mar')
  })
})

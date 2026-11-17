import { describe, expect, it } from 'vitest'
import { streetOf } from '@/lib/broadcast/daily-poster'

/*
 * A POSTCODE NEVER PRINTS IN A POSTER'S STREET (seen in the pack of 18 November 2026, 08:01: the Campbell poster drew
 * 'Melbourne Recital Centre, 31 Sturt St Southbank 3006, Melbourne'; read on production at 08:57, the one address of the
 * class). A first part that ends in a postcode, with or without its state, keeps the street and the suburb and drops the
 * code; a first part that is only a postcode or a state and postcode prints nothing, as before.
 */
describe("the street a poster prints", () => {
  it('drops a trailing postcode from the street', () => {
    expect(streetOf('31 Sturt St Southbank 3006', 'Melbourne Recital Centre', 'Melbourne')).toBe('31 Sturt St Southbank')
    expect(streetOf('31 Sturt St Southbank VIC 3006, Australia', 'Melbourne Recital Centre', 'Melbourne')).toBe('31 Sturt St Southbank')
  })
  it('keeps a street as it was', () => {
    expect(streetOf('140 High St, Belmont VIC 3216', 'Archive Wine Bar', 'Geelong')).toBe('140 High St')
    expect(streetOf('VIC 3216', 'Archive Wine Bar', 'Geelong')).toBeNull()
    expect(streetOf(null, 'Archive Wine Bar', 'Geelong')).toBeNull()
  })
})

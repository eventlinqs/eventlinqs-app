import { describe, expect, test } from 'vitest'
import { countOrRaise } from '@/lib/supabase/count-or-raise'

/**
 * THREE FACTS, ONE NUMBER, AND `?? 0` COLLAPSED THEM.
 *
 * `.select('id', { count: 'exact', head: true })` answers `{ count, error }`.
 * The count is zero, or the read failed, or the count was never asked for, and
 * `count ?? 0` renders all three as "0". On the founder's demand-signal screen
 * that made an unreachable database look like a platform nobody is using, and
 * `CAP - (taken ?? 0)` made it look like every founding spot was still free.
 */
describe('countOrRaise', () => {
  test('a real count is returned, and zero is a real count', () => {
    expect(countOrRaise('events published', { count: 285, error: null })).toBe(285)
    expect(countOrRaise('events published', { count: 0, error: null })).toBe(0)
  })

  test('a failed read raises, and names the figure that gave up', () => {
    expect(() => countOrRaise('founding spots taken', { count: null, error: { message: 'connection reset' } })).toThrow(
      /the count of founding spots taken could not be read: connection reset/,
    )
  })

  test('an error wins even when a count came back with it, because the count cannot be trusted', () => {
    expect(() => countOrRaise('tracked link clicks', { count: 41, error: { message: 'timeout' } })).toThrow(/timeout/)
  })

  test('a null count with no error is reported as the caller mistake it is, not as zero', () => {
    expect(() => countOrRaise('posters downloaded', { count: null, error: null })).toThrow(
      /came back null with no error; it was not asked for/,
    )
  })
})

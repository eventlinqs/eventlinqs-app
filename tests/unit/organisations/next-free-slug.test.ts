import { describe, expect, it } from 'vitest'
import { ORGANISATION_SLUG_MAX, nextFreeSlug } from '@/lib/organisations/next-free-slug'

/**
 * A taken organisation address is a step, never a wall (Lawal, 15:27 on
 * 14 November 2026). These pin the choice the action makes when the organiser's
 * own address is taken: the first free numbered one, never too long for the form.
 */
describe('nextFreeSlug', () => {
  it('keeps the organiser’s own address when it is free', () => {
    expect(nextFreeSlug('sunset-sessions', new Set())).toBe('sunset-sessions')
    expect(nextFreeSlug('sunset-sessions', new Set(['other-night']))).toBe('sunset-sessions')
  })

  it('takes the first free numbered neighbour when it is taken', () => {
    expect(nextFreeSlug('sunset-sessions', new Set(['sunset-sessions']))).toBe('sunset-sessions-2')
    expect(
      nextFreeSlug('sunset-sessions', new Set(['sunset-sessions', 'sunset-sessions-2', 'sunset-sessions-3'])),
    ).toBe('sunset-sessions-4')
  })

  it('never returns an address longer than the form accepts, and never ends a stem on a hyphen', () => {
    const long = 'a'.repeat(ORGANISATION_SLUG_MAX - 1) + 'b'
    const got = nextFreeSlug(long, new Set([long]))
    expect(got).not.toBeNull()
    expect(got!.length).toBeLessThanOrEqual(ORGANISATION_SLUG_MAX)
    expect(got!.endsWith('-2')).toBe(true)
    const hyphenAtCut = 'a'.repeat(ORGANISATION_SLUG_MAX - 3) + '-bb'
    const cut = nextFreeSlug(hyphenAtCut, new Set([hyphenAtCut]))
    expect(cut).not.toMatch(/--/)
  })

  it('answers null only when a thousand neighbours are taken, so the caller can say so in words', () => {
    const taken = new Set(['x'])
    for (let n = 2; n <= 1000; n += 1) taken.add(`x-${n}`)
    expect(nextFreeSlug('x', taken)).toBeNull()
  })
})

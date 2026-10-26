import { describe, expect, it } from 'vitest'
import { applyPublicEventVisibility, listingFreshOrPredicate } from '@/lib/events/public-visibility'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'

/**
 * WI2-ITEM.md, "Last checked": "A night not confirmed for 21 days is hidden from
 * the guide until checked again." The rule lives in the one visibility helper
 * every discovery read composes, so it hides an unchecked night from every
 * surface at once, and never touches an organiser's own event (no freshness date).
 */

type Call = [string, ...unknown[]]

function recorder() {
  const calls: Call[] = []
  const q: Record<string, (...args: unknown[]) => unknown> = {}
  for (const m of ['eq', 'is', 'or']) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return q
    }
  }
  return { q, calls }
}

const NOW = new Date('2026-10-24T00:00:00Z')

describe('the freshness group', () => {
  it('admits an organiser event (no date) and a listing checked within its days, nothing else', () => {
    expect(listingFreshOrPredicate(NOW)).toBe('listing_fresh_until.is.null,listing_fresh_until.gte.2026-10-24T00:00:00.000Z')
  })

  it('is composed by every discovery read, beside the listing window and never instead of it', () => {
    const { q, calls } = recorder()
    applyPublicEventVisibility(q, { now: NOW })
    const ors = calls.filter((c) => c[0] === 'or').map((c) => c[1])
    expect(ors).toEqual([listingWindowOrPredicate(NOW), listingFreshOrPredicate(NOW)])
    expect(calls).toContainEqual(['eq', 'status', 'published'])
    expect(calls).toContainEqual(['eq', 'visibility', 'public'])
    expect(calls).toContainEqual(['is', 'external_ticket_url', null])
  })

  it('holds for a surface that lists externally ticketed events too', () => {
    const { q, calls } = recorder()
    applyPublicEventVisibility(q, { now: NOW, includeExternal: true })
    expect(calls.filter((c) => c[0] === 'or').map((c) => c[1])).toContain(listingFreshOrPredicate(NOW))
  })
})

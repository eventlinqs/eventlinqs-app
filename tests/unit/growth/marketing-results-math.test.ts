import { describe, expect, it } from 'vitest'
import { marketingResults, rate } from '@/lib/growth/marketing-results-math'
import type { OrderRow } from '@/lib/growth/weekly-math'

/*
 * THE ORGANISER MARKETING RESULTS CARD (the PM's 12:40 of 18 November 2026, item 5): each figure counted from its rows,
 * a figure with nothing behind it reads 0, never blank, and revenue is EventLinqs' own kept fee, never the ticket value.
 */
const money = (c: number) => `$${(c / 100).toFixed(2)}`
const order = (o: Partial<OrderRow>): OrderRow => ({
  totalCents: 5000, platformFeeCents: 274, status: 'confirmed', createdAt: '2026-11-19T00:00:00Z', organisationId: 'org-1', eventId: 'ev-1',
  retainedCents: 274, processingCents: 100, refundedCents: 0, ...o,
})
const empty = { letters: [], replies: [], organisations: [], activations: [], orders: [], clicks: [], money }
const value = (r: ReturnType<typeof marketingResults>, key: string) => r.figures.find((f) => f.key === key)?.value

describe('the Organiser Marketing results card', () => {
  it('reads 0 for every figure with nothing behind it, never blank and never NaN', () => {
    const r = marketingResults(empty)
    expect(r.figures.map((f) => f.key)).toEqual(['sent', 'positive', 'accepted', 'registered', 'activations', 'revenue', 'repeat'])
    for (const f of r.figures) {
      expect(f.value, f.key).not.toBe('')
      expect(f.value, f.key).not.toMatch(/NaN|undefined/)
      expect(f.source.length, f.key).toBeGreaterThan(10)
    }
    expect(value(r, 'positive')).toBe('0%')
    expect(value(r, 'revenue')).toBe('$0.00')
    expect(r.variants).toEqual([
      { variant: 'A', sent: 0, replies: 0, positive: 0, rate: '0%' },
      { variant: 'B', sent: 0, replies: 0, positive: 0, rate: '0%' },
    ])
    expect(rate(1, 3)).toBe('33.3%')
  })

  it('counts replies only to the letters, positive as yes or interested, accepted as yes, and by subject variant', () => {
    const letters = [
      { id: 't1', sentAt: '2026-11-18T03:00:00Z', half: 'a' as const },
      { id: 't2', sentAt: '2026-11-18T03:15:00Z', half: 'a' as const },
      { id: 't3', sentAt: '2026-11-18T03:30:00Z', half: 'b' as const },
      { id: 't4', sentAt: '2026-11-18T03:45:00Z', half: 'b' as const },
    ]
    const replies = [
      { touchId: 't1', outcome: 'yes' }, { touchId: 't2', outcome: 'question' }, { touchId: 't3', outcome: 'interested' },
      { touchId: 'other', outcome: 'yes' }, { touchId: null, outcome: 'yes' },
    ]
    const r = marketingResults({ ...empty, letters, replies, organisations: [{ createdAt: '2026-11-17T00:00:00Z' }, { createdAt: '2026-11-18T05:00:00Z' }] })
    expect(value(r, 'sent')).toBe('4')
    expect(value(r, 'positive')).toBe('50%')
    expect(value(r, 'accepted')).toBe('1')
    expect(value(r, 'registered')).toBe('1')
    expect(r.variants).toEqual([
      { variant: 'A', sent: 2, replies: 2, positive: 1, rate: '100%' },
      { variant: 'B', sent: 2, replies: 1, positive: 1, rate: '50%' },
    ])
  })

  it('counts revenue as the kept fee less what refunds gave back, on sold orders only, never the ticket value', () => {
    const r = marketingResults({
      ...empty,
      orders: [
        order({}),
        order({ status: 'partially_refunded', totalCents: 4000, retainedCents: 200, refundedCents: 2000, eventId: 'ev-2' }),
        order({ status: 'pending', retainedCents: 999 }),
        order({ status: 'confirmed', retainedCents: null, organisationId: 'org-2' }),
      ],
    })
    expect(value(r, 'revenue')).toBe('$3.74')
    expect(r.figures.find((f) => f.key === 'revenue')?.detail).toBe('1 sold order(s) record no kept fee')
    expect(value(r, 'repeat')).toBe('1')
  })

  it('counts each post\'s clicks, most first', () => {
    const r = marketingResults({ ...empty, clicks: [{ pieceId: 'p1', label: 'LANY' }, { pieceId: 'p2', label: 'AMCF' }, { pieceId: 'p2', label: 'AMCF' }] })
    expect(r.posts).toEqual([{ label: 'AMCF', clicks: 2 }, { label: 'LANY', clicks: 1 }])
  })
})

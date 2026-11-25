import { describe, expect, it } from 'vitest'
import { dueSources, type RegisteredSource } from '@/lib/listings/collect'

/*
 * A SOURCE IS READ AT ITS OWNER'S AGREED PACE (the PM's 15:51 of 25 November 2026): Bendigo Tourism said yes to a WEEKLY
 * read of its What's On calendar. Red before: dueSources read every 'read' source in each morning's run, and a source
 * holding nights this week every 6 hours, so it would have been read daily, against the promise. Now a source with an
 * agreed pace is read again only that many days after its last successful read; every other source is untouched.
 */
const src = (id: string, over: Partial<RegisteredSource>): RegisteredSource => ({
  id, name: id, pageUrl: `https://${id}.example.com`, collection: 'read', changes: 'weekly', lastCheckedAt: null, lastSuccessAt: null, permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, ...over,
})
// Thursday 26 November 2026, 04:10 in Melbourne: the morning run.
const morning = new Date('2026-11-25T17:10:00Z')
const daysAgo = (d: number) => new Date(morning.getTime() - d * 86_400_000).toISOString()

describe("a source read at its owner's agreed pace", () => {
  it('a weekly source read two days ago is not read in this morning run, nor for its nights this week', () => {
    const weekly = src('bendigo', { readAtMostEveryDays: 7, lastCheckedAt: daysAgo(2), lastSuccessAt: daysAgo(2) })
    expect(dueSources([weekly], morning)).toEqual([])
    expect(dueSources([weekly], morning, new Set(['bendigo']))).toEqual([])
  })
  it('read a week ago in the same morning run: due again in this one', () => {
    expect(dueSources([src('bendigo', { readAtMostEveryDays: 7, lastCheckedAt: daysAgo(7), lastSuccessAt: daysAgo(7) })], morning).map((s) => s.id)).toEqual(['bendigo'])
  })
  it('never read yet: due; a read that failed after its week is retried, one inside its week is not', () => {
    expect(dueSources([src('new', { readAtMostEveryDays: 7 })], morning).map((s) => s.id)).toEqual(['new'])
    expect(dueSources([src('late', { readAtMostEveryDays: 7, lastCheckedAt: daysAgo(1), lastSuccessAt: daysAgo(8) })], morning).map((s) => s.id)).toEqual(['late'])
    expect(dueSources([src('early', { readAtMostEveryDays: 7, lastCheckedAt: daysAgo(1), lastSuccessAt: daysAgo(3) })], morning)).toEqual([])
  })
  it('a source with no agreed pace keeps its daily read', () => {
    expect(dueSources([src('daily', { lastCheckedAt: daysAgo(1), lastSuccessAt: daysAgo(1) })], morning).map((s) => s.id)).toEqual(['daily'])
  })
})

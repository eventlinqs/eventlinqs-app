import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dueSources, type RegisteredSource } from '@/lib/listings/collect'

/*
 * THE RE-READ SCHEDULE (Lawal, 1 November 2026, 16:15, the controller's 16:15 (B)): every registered source is read at
 * least once a day, in the early morning run, so each day's guide is right before people look; a source's own interval
 * runs between 6 and 24 hours; one holding nights in the next seven days is read every 6 hours; on the morning of a
 * night its source is checked once more; a source stopped by a 403 or 429 is not read until a person clears it.
 * The run is scheduled hourly so each source is read when it falls due.
 */

// 1 November 2026, 06:00 UTC = 17:00 in Melbourne (daylight time, UTC+11).
const NOW = new Date('2026-11-01T06:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const source = (id: string, over: Partial<RegisteredSource> = {}): RegisteredSource => ({
  id, name: id, pageUrl: `https://${id}.example.com.au/whats-on`, collection: 'read', changes: 'weekly',
  lastCheckedAt: hoursAgo(2), lastSuccessAt: hoursAgo(2),
  permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, ...over,
})
const ids = (s: RegisteredSource[]) => s.map((x) => x.id)

describe('every source at least daily, early morning; this week every 6 hours', () => {
  it('a weekly source not read since before this morning (04:00 Melbourne) is due: every source is read every day', () => {
    // 14 hours ago = 03:00 Melbourne today: before the morning run.
    expect(ids(dueSources([source('weekly', { lastCheckedAt: hoursAgo(14), lastSuccessAt: hoursAgo(14) })], NOW))).toEqual(['weekly'])
  })

  it('a weekly source read this morning is not due again today', () => {
    expect(ids(dueSources([source('weekly', { lastCheckedAt: hoursAgo(10), lastSuccessAt: hoursAgo(10) })], NOW))).toEqual([])
  })

  it('a source holding nights in the next seven days is due after 6 hours, and not before', () => {
    const thisWeek = new Set(['soon'])
    expect(ids(dueSources([source('soon', { lastCheckedAt: hoursAgo(7), lastSuccessAt: hoursAgo(7) })], NOW, thisWeek))).toEqual(['soon'])
    expect(ids(dueSources([source('soon', { lastCheckedAt: hoursAgo(5), lastSuccessAt: hoursAgo(5) })], NOW, thisWeek))).toEqual([])
  })

  it('never more often than every 6 hours, even for a this-week source', () => {
    expect(ids(dueSources([source('soon', { lastCheckedAt: hoursAgo(2), lastSuccessAt: hoursAgo(2) })], NOW, new Set(['soon'])))).toEqual([])
  })

  it('a source that may not be read is never made due', () => {
    expect(ids(dueSources([source('ask', { collection: 'ask', lastCheckedAt: hoursAgo(30) })], NOW, new Set(['ask'])))).toEqual([])
  })

  it('the collection run is scheduled every hour', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
    const run = vercel.crons.find((c) => c.path === '/api/cron/collection-run')
    expect(run?.schedule).toMatch(/^\d{1,2} \* \* \* \*$/)
  })
})

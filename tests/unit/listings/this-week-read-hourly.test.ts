import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dueSources, type RegisteredSource } from '@/lib/listings/collect'

/*
 * THIS WEEK FIRST (Lawal, 1 November 2026, 16:13, the controller's 16:14 (2)): a source holding nights in the next seven
 * days is read every hour, so a new, changed, postponed or cancelled night reaches the site within the hour of the
 * next read; every other source keeps its own pace. The run itself therefore runs hourly.
 */

const NOW = new Date('2026-11-01T06:00:00Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

const source = (id: string, over: Partial<RegisteredSource> = {}): RegisteredSource => ({
  id, name: id, pageUrl: `https://${id}.example.com.au/whats-on`, collection: 'read', changes: 'weekly',
  lastCheckedAt: ago(120), lastSuccessAt: ago(120),
  permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, ...over,
})

describe('a source with nights this week is read every hour', () => {
  it('a weekly source last read two hours ago is due when it holds a night in the next seven days, and not otherwise', () => {
    const s = [source('soon'), source('later')]
    expect(dueSources(s, NOW, new Set(['soon'])).map((x) => x.id)).toEqual(['soon'])
  })

  it('read within the last hour, even a this-week source waits for its next hour', () => {
    expect(dueSources([source('soon', { lastCheckedAt: ago(30), lastSuccessAt: ago(30) })], NOW, new Set(['soon']))).toEqual([])
  })

  it('a source that may not be read is never made due by holding nights this week', () => {
    expect(dueSources([source('ask', { collection: 'ask' })], NOW, new Set(['ask']))).toEqual([])
  })

  it('without the set, every source keeps its own pace (the old behaviour)', () => {
    expect(dueSources([source('soon')], NOW).map((x) => x.id)).toEqual([])
  })

  it('the collection run is scheduled every hour', () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: { path: string; schedule: string }[] }
    const run = vercel.crons.find((c) => c.path === '/api/cron/collection-run')
    expect(run?.schedule).toMatch(/^\d{1,2} \* \* \* \*$/)
  })
})

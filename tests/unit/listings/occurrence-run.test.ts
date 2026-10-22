import { describe, expect, it } from 'vitest'
import type { ExistingOccurrence } from '@/lib/listings/occurrence-plan'
import {
  runOccurrences,
  type ListingNight,
  type OccurrenceStore,
  type StoreResult,
} from '@/lib/listings/occurrence-run'

/**
 * WI2 Part 1: the daily run, against a store held in memory. The names below
 * are invented for the test.
 */

const NOW = new Date('2026-10-23T00:00:00Z')

const night = (over: Partial<ListingNight> = {}): ListingNight => ({
  id: 's-1',
  organisationId: 'org-listings',
  venueId: 'v-1',
  rule: 'weekly',
  anchorDate: '2026-10-21',
  startsAt: '19:00',
  endsAt: '22:00',
  timezone: 'Australia/Melbourne',
  status: 'active',
  name: 'Folk Night',
  summary: 'Local players take turns on the small stage.',
  categoryId: 'cat-music',
  ageRestrictionMin: null,
  ...over,
})

/** A store that keeps occurrences in a map and records every call in order. */
function memoryStore(nights: ListingNight[], refuse: (call: string, date: string) => string | null = () => null) {
  const rows = new Map<string, ExistingOccurrence & { seriesId: string }>()
  const calls: string[] = []
  const answer = (call: string, date: string): StoreResult => {
    const why = refuse(call, date)
    return why ? { ok: false, reason: why } : { ok: true }
  }
  const store: OccurrenceStore = {
    async nights() {
      return nights
    },
    async occurrences(seriesId) {
      return [...rows.values()].filter((r) => r.seriesId === seriesId)
    },
    async create({ night: n, date, fields, guideDay }) {
      calls.push(`create ${date}`)
      const result = answer('create', date)
      if (result.ok) {
        rows.set(`${n.id}|${date}`, {
          id: `e-${date}`,
          seriesId: n.id,
          occurrenceDate: date,
          status: 'published',
          title: fields.title,
          summary: fields.summary,
          startIso: fields.start_date,
          endIso: fields.end_date,
          timezone: fields.timezone,
          categoryId: fields.category_id,
          ageRestrictionMin: fields.age_restriction_min,
          opens: guideDay.opens,
          closes: guideDay.closes,
          reminderCount: 0,
        })
      }
      return result
    },
    async update({ id }) {
      calls.push(`update ${id}`)
      return answer('update', id)
    },
    async cancel(id) {
      calls.push(`cancel ${id}`)
      return answer('cancel', id)
    },
    async delete(id) {
      calls.push(`delete ${id}`)
      const key = [...rows.entries()].find(([, r]) => r.id === id)?.[0]
      if (key) rows.delete(key)
      return answer('delete', id)
    },
  }
  return { store, rows, calls }
}

describe('the daily run', () => {
  it('makes a new night its 8 dates, then on a second run writes nothing', async () => {
    const { store, calls } = memoryStore([night()])
    const first = await runOccurrences(store, NOW)
    expect(first).toMatchObject({ nights: 1, created: 8, updated: 0, deleted: 0, cancelled: 0, failed: [], held: [] })
    calls.length = 0
    const second = await runOccurrences(store, NOW)
    expect(second).toMatchObject({ created: 0, unchanged: 8 })
    expect(calls).toEqual([])
  })

  it('takes a date off before it makes the one that replaces it', async () => {
    const { store, calls } = memoryStore([night()])
    await runOccurrences(store, NOW)
    calls.length = 0
    const skipped = memoryStore([night({ skipDates: ['2026-11-04'] })])
    // The same rows, now under a night that skips 4 November.
    const run = await runOccurrences(
      { ...store, nights: skipped.store.nights },
      NOW,
    )
    expect(run).toMatchObject({ deleted: 1, created: 1 })
    expect(calls).toEqual(['delete e-2026-11-04', 'create 2026-12-23'])
  })

  it('one night failing never stops the next, and the reason is kept by name', async () => {
    const bad = night({ id: 's-bad', startsAt: '7pm' })
    const { store } = memoryStore([bad, night()])
    const run = await runOccurrences(store, NOW)
    expect(run.failed).toEqual([
      { seriesId: 's-bad', date: null, why: 'series cannot produce dates: the start 7pm is not an HH:MM time' },
    ])
    expect(run.created).toBe(8)
  })

  it('a store refusal is recorded against its date, and the other dates still land', async () => {
    const { store } = memoryStore([night()], (call, date) =>
      call === 'create' && date === '2026-11-11' ? 'the publish gate refused: Add the hours for each day' : null,
    )
    const run = await runOccurrences(store, NOW)
    expect(run.created).toBe(7)
    expect(run.failed).toEqual([
      { seriesId: 's-1', date: '2026-11-11', why: 'the publish gate refused: Add the hours for each day' },
    ])
  })
})

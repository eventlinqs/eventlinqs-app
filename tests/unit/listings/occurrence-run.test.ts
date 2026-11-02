import { describe, expect, it } from 'vitest'
import { ABANDONED_DRAFT_AFTER_MS, type ExistingOccurrence } from '@/lib/listings/occurrence-plan'
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
          createdAt: NOW.toISOString(),
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

/**
 * THE RUN WORKS TO A DEADLINE (24 October 2026, found by the Part 2 drive: a
 * median 7.3 s per date against TEST, about 300 dates owed after an import, and
 * a platform that ends a function at its maximum duration).
 */
describe('a run with a deadline', () => {
  const two = () => [night(), night({ id: 's-2', name: 'Quiz Night' })]

  it('starts no write at or past its deadline, says how many nights it did not finish, and the next run finishes them', async () => {
    let t = 0
    const { store } = memoryStore(two())
    const slow: OccurrenceStore = {
      ...store,
      async create(input) {
        t += 10_000 // each date takes ten seconds to make
        return store.create(input)
      },
    }
    // Writes start at 0, 10, 20 and 30 s; the fifth would start at 40 s, past 35 s.
    const first = await runOccurrences(slow, NOW, { deadline: 35_000, clock: () => t })
    expect(first).toMatchObject({ created: 4, stoppedEarly: true, nightsNotReached: 2, failed: [] })
    const second = await runOccurrences(slow, NOW, { deadline: t + 3_600_000, clock: () => t })
    expect(second).toMatchObject({ created: 12, unchanged: 4, stoppedEarly: false, nightsNotReached: 0, failed: [] })
  })

  it('a deadline already passed starts nothing at all', async () => {
    const { store, calls } = memoryStore(two())
    const run = await runOccurrences(store, NOW, { deadline: 0, clock: () => 1 })
    expect(run).toMatchObject({ nights: 0, created: 0, stoppedEarly: true, nightsNotReached: 2 })
    expect(calls).toEqual([])
  })

  it('without a deadline it does every night, as it always did', async () => {
    const { store } = memoryStore(two())
    expect(await runOccurrences(store, NOW)).toMatchObject({ created: 16, stoppedEarly: false, nightsNotReached: 0 })
  })

  it('a draft a stopped run left behind is taken away and its date made again, in that order', async () => {
    const { store, rows, calls } = memoryStore([night()])
    await runOccurrences(store, NOW)
    const left = rows.get('s-1|2026-11-04')
    if (!left) throw new Error('the first run made no 4 November')
    rows.set('s-1|2026-11-04', {
      ...left,
      status: 'draft',
      createdAt: new Date(NOW.getTime() - ABANDONED_DRAFT_AFTER_MS - 60_000).toISOString(),
    })
    calls.length = 0
    const run = await runOccurrences(store, NOW)
    expect(run).toMatchObject({ deleted: 1, created: 1, failed: [], held: [] })
    expect(calls).toEqual(['delete e-2026-11-04', 'create 2026-11-04'])
    expect(rows.get('s-1|2026-11-04')?.status).toBe('published')
  })
})

/**
 * A CONVERSION DOES NOT DEPEND ON RUN ORDER (2 November 2026, production, quoted from the 10:10 run: '774 nights:
 * 42 made ... 184 deleted ... 43 failed', each failure 'duplicate key value violates unique constraint
 * "events_organisation_id_slug_key"'). A weekly series was paused and its posted dates held as one-off series. The
 * run took series in id order, so a one-off that sorted BEFORE its weekly sibling tried to write its night while the
 * sibling's retiring night still held the address; the sibling's nights were deleted later in the same run, and the
 * real nights stayed missing for an hour. Every night a run will retire is now retired before any night is written.
 */
describe('a conversion from a weekly series to dated nights', () => {
  /** The store refuses a night whose address (name and date, as the slug) another series' row still holds. */
  function addressStore(nights: ListingNight[]) {
    const base = memoryStore(nights)
    const store: OccurrenceStore = {
      ...base.store,
      async create(input) {
        const taken = [...base.rows.values()].some(
          (r) => r.seriesId !== input.night.id && r.occurrenceDate === input.date && r.title === input.fields.title,
        )
        if (taken) {
          base.calls.push(`create ${input.date} refused`)
          return { ok: false, reason: 'duplicate key value violates unique constraint "events_organisation_id_slug_key"' }
        }
        return base.store.create(input)
      },
    }
    return { ...base, store }
  }

  it('makes every dated night in the same run that retires the weekly nights, whichever series comes first', async () => {
    const weekly = night({ id: 's-weekly' })
    const { store, rows, calls } = addressStore([weekly])
    await runOccurrences(store, NOW)
    expect(rows.get('s-weekly|2026-11-04')).toBeDefined()

    // The weekly is paused and 4 November is held as a one-off whose id sorts BEFORE the weekly's.
    const dated = night({ id: 'a-once', rule: 'once', anchorDate: '2026-11-04' })
    const converted = { ...store, nights: async () => [dated, { ...weekly, status: 'paused' as const }] }
    calls.length = 0
    const run = await runOccurrences(converted, NOW)

    expect(run.failed).toEqual([])
    expect(run).toMatchObject({ created: 1, deleted: 8 })
    expect(rows.get('a-once|2026-11-04')?.status).toBe('published')
    expect([...rows.values()].filter((r) => r.seriesId === 's-weekly')).toEqual([])
    expect(calls.indexOf('create 2026-11-04')).toBeGreaterThan(calls.indexOf('delete e-2026-11-04'))
  })
})

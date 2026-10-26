import { describe, expect, it } from 'vitest'
import {
  occurrenceSlug,
  planOccurrences,
  type ExistingOccurrence,
  type NightForOccurrences,
} from '@/lib/listings/occurrence-plan'

/**
 * WI2 Part 1: which dated events a night needs (docs/walk-in/WI2-PLAN.md
 * section 7). Every instant below was checked against the platform's own Date
 * and Intl before it was written here: Melbourne is UTC+11 from 4 October 2026.
 */

const NOW = new Date('2026-10-23T00:00:00Z') // 11am on Friday 23 October in Melbourne

const night = (over: Partial<NightForOccurrences> = {}): NightForOccurrences => ({
  rule: 'weekly',
  anchorDate: '2026-10-21',
  startsAt: '19:00',
  endsAt: '22:00',
  timezone: 'Australia/Melbourne',
  status: 'active',
  name: 'Folk Night',
  summary: 'Local players take turns on the small stage.',
  categoryId: 'cat-music',
  ageRestrictionMin: 18,
  ...over,
})

/** A row exactly as the night would write it for `date` (a Wednesday, 7pm to 10pm). */
const row = (date: string, over: Partial<ExistingOccurrence> = {}): ExistingOccurrence => {
  const [y, m, d] = date.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, d, 8, 0)) // 19:00 at UTC+11
  return {
    id: `e-${date}`,
    occurrenceDate: date,
    status: 'published',
    title: 'Folk Night',
    summary: 'Local players take turns on the small stage.',
    startIso: start.toISOString(),
    endIso: new Date(start.getTime() + 3 * 3600_000).toISOString(),
    timezone: 'Australia/Melbourne',
    categoryId: 'cat-music',
    ageRestrictionMin: 18,
    opens: '19:00',
    closes: '22:00',
    reminderCount: 0,
    ...over,
  }
}

const EIGHT = ['2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25', '2026-12-02', '2026-12-09', '2026-12-16']

describe('a new night', () => {
  it('gets an event for each of its next 8 dates, as the night gave them', () => {
    const p = planOccurrences(night(), [], NOW)
    expect(p.create.map((c) => c.date)).toEqual(EIGHT)
    expect(p.create[0].fields).toEqual({
      title: 'Folk Night',
      summary: 'Local players take turns on the small stage.',
      start_date: '2026-10-28T08:00:00.000Z',
      end_date: '2026-10-28T11:00:00.000Z',
      timezone: 'Australia/Melbourne',
      category_id: 'cat-music',
      is_age_restricted: true,
      age_restriction_min: 18,
    })
    expect(p.create[0].guideDay).toEqual({ date: '2026-10-28', opens: '19:00', closes: '22:00', hours_label: null, items: [], closer: null })
  })

  it('no age limit is not age restricted', () => {
    const p = planOccurrences(night({ ageRestrictionMin: null }), [], NOW)
    expect(p.create[0].fields).toMatchObject({ is_age_restricted: false, age_restriction_min: null })
  })
})

describe('the daily run keeps 8 ahead and writes nothing it need not', () => {
  it('all 8 present and as the night is: nothing to do', () => {
    const p = planOccurrences(night(), EIGHT.map((d) => row(d)), NOW)
    expect(p).toEqual({ create: [], update: [], retire: [], held: [], unchanged: 8 })
  })

  it('a week on, the next date is added and the past one is left alone', () => {
    const later = new Date('2026-10-30T00:00:00Z')
    const p = planOccurrences(night(), EIGHT.map((d) => row(d)), later)
    expect(p.create.map((c) => c.date)).toEqual(['2026-12-23'])
    expect(p.retire).toEqual([])
    expect(p.unchanged).toBe(8)
  })
})

describe('a changed night changes its future dates only', () => {
  it('a new finish time reaches every future occurrence and its hours, never a past one', () => {
    const past = row('2026-10-21')
    const p = planOccurrences(night({ endsAt: '23:00' }), [past, ...EIGHT.map((d) => row(d))], NOW)
    expect(p.update).toHaveLength(8)
    expect(p.update[0]).toEqual({
      id: 'e-2026-10-28',
      date: '2026-10-28',
      changes: { end_date: '2026-10-28T12:00:00.000Z' },
      guideDay: { date: '2026-10-28', opens: '19:00', closes: '23:00', hours_label: null, items: [], closer: null },
    })
    expect(p.update.some((u) => u.id === past.id)).toBe(false)
    expect(p.unchanged).toBe(1)
  })

  it('new words change the words and leave the hours', () => {
    const p = planOccurrences(night({ summary: 'Players take turns.' }), EIGHT.map((d) => row(d)), NOW)
    expect(p.update[0]).toMatchObject({ changes: { summary: 'Players take turns.' }, guideDay: null })
  })
})

describe('a date that goes comes off through the lifecycle law', () => {
  it('a skipped date nobody asked about is deleted, and the window reaches one further', () => {
    const p = planOccurrences(night({ skipDates: ['2026-11-04'] }), EIGHT.map((d) => row(d)), NOW)
    expect(p.retire).toEqual([{ id: 'e-2026-11-04', date: '2026-11-04', action: 'delete', why: '2026-11-04 is skipped' }])
    expect(p.create.map((c) => c.date)).toEqual(['2026-12-23'])
  })

  it('one somebody asked to be reminded of is cancelled, so they are told', () => {
    const rows = EIGHT.map((d) => row(d, d === '2026-11-04' ? { reminderCount: 2 } : {}))
    const p = planOccurrences(night({ skipDates: ['2026-11-04'] }), rows, NOW)
    expect(p.retire[0]).toMatchObject({ action: 'cancel' })
  })

  it('a removed night takes every future date off and adds none', () => {
    const p = planOccurrences(night({ status: 'removed' }), EIGHT.map((d) => row(d)), NOW)
    expect(p.retire).toHaveLength(8)
    expect(p.retire.every((r) => r.why === 'the night was removed')).toBe(true)
    expect(p.create).toEqual([])
  })

  it('a changed rule takes off the dates it no longer has', () => {
    const p = planOccurrences(night({ rule: 'fortnightly' }), EIGHT.map((d) => row(d)), NOW)
    expect(p.retire.map((r) => r.date)).toEqual(['2026-10-28', '2026-11-11', '2026-11-25', '2026-12-09'])
    expect(p.retire[0].why).toBe('2026-10-28 is no longer one of its dates')
  })

  it('a row made while a skip pushed the window out stays when the skip goes', () => {
    const rows = [...EIGHT, '2026-12-23'].map((d) => row(d))
    const p = planOccurrences(night(), rows, NOW)
    expect(p.retire).toEqual([])
    expect(p.unchanged).toBe(9)
  })
})

describe('a cancelled date is held, never written over', () => {
  it('names it when the date is wanted again', () => {
    const rows = EIGHT.map((d) => row(d, d === '2026-11-04' ? { status: 'cancelled' } : {}))
    const p = planOccurrences(night(), rows, NOW)
    expect(p.held).toEqual([{ date: '2026-11-04', why: '2026-11-04 was cancelled, and a cancelled event never comes back' }])
    expect(p.create).toEqual([])
    expect(p.update).toEqual([])
  })
})

describe("an occurrence's address", () => {
  it('reads as the night, the host and the date, the same every time', () => {
    expect(occurrenceSlug('Corner Hall Trivia', 'the-corner-hall', '2026-10-28')).toBe('corner-hall-trivia-the-corner-hall-2026-10-28')
    expect(occurrenceSlug('Corner Hall Trivia', 'the-corner-hall', '2026-10-28')).toBe(occurrenceSlug('Corner Hall Trivia', 'the-corner-hall', '2026-10-28'))
  })

  it('leaves the host out when the name already carries it', () => {
    expect(occurrenceSlug('Folk Night at Pat-s Bar', 'pat-s-bar', '2026-10-28')).toBe('folk-night-at-pat-s-bar-2026-10-28')
  })

  it('two hosts with a night of one name never share an address', () => {
    expect(occurrenceSlug('Trivia', 'the-corner-hall', '2026-10-28')).not.toBe(occurrenceSlug('Trivia', 'pat-s-bar', '2026-10-28'))
  })
})

describe('a night with no finish (the 22:25 answer 1)', () => {
  it('has no closing time on its guide day, and its row ends at the close of its own day', () => {
    const p = planOccurrences(night({ endsAt: null }), [], NOW)
    expect(p.create).toHaveLength(8)
    expect(p.create[0].guideDay).toMatchObject({ date: '2026-10-28', opens: '19:00', closes: null })
    // Midnight starting 29 October in Melbourne, UTC+11.
    expect(p.create[0].fields.end_date).toBe('2026-10-28T13:00:00.000Z')
    expect(Date.parse(p.create[0].fields.end_date)).toBeGreaterThan(Date.parse(p.create[0].fields.start_date))
  })
})

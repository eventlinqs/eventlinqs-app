/*
 * FRESHNESS BY DISTANCE (the PM's 07:00 of 15 November 2026, item 4 (c) and (d)): src/lib/listings/freshness.ts and the
 * migration's listing_fresh_from_reads say the same thing. The migration's own lines are read here, so the two cannot drift
 * apart without this test going red.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { freshUntil, startOfDayIn } from '@/lib/listings/freshness'

const DAY = 24 * 3_600_000
const iso = (d: Date) => d.toISOString()

describe('a night is fresh from its newest agreeing read for as long as its distance allows', () => {
  const read = new Date('2026-11-15T00:00:00Z') // 11:00 Melbourne
  it('more than 30 days out: 30 days, never past the edge of the next tier', () => {
    expect(iso(freshUntil(read, new Date(read.getTime() + 90 * DAY)))).toBe(iso(new Date(read.getTime() + 30 * DAY)))
    // 40 days out: 30 days would carry it to 10 days out, inside the 7 day tier, so it lapses where that tier begins.
    expect(iso(freshUntil(read, new Date(read.getTime() + 40 * DAY)))).toBe(iso(new Date(read.getTime() + 10 * DAY)))
  })
  it('8 to 30 days out: 7 days', () => {
    expect(iso(freshUntil(read, new Date(read.getTime() + 20 * DAY)))).toBe(iso(new Date(read.getTime() + 7 * DAY)))
  })
  it('2 to 7 days out: 2 days', () => {
    expect(iso(freshUntil(read, new Date(read.getTime() + 5 * DAY)))).toBe(iso(new Date(read.getTime() + 2 * DAY)))
  })
  it('its last 2 days: until 06:00 Melbourne on its own day, unless read on its own day (the day of check)', () => {
    const tonight = new Date('2026-11-16T09:00:00Z') // Mon 16 Nov, 8:00 pm Melbourne
    const sixAm = new Date('2026-11-15T19:00:00Z') // Mon 16 Nov, 6:00 am Melbourne (UTC+11)
    expect(iso(freshUntil(read, tonight))).toBe(iso(sixAm))
    const dayOf = new Date('2026-11-15T18:25:00Z') // Mon 16 Nov, 5:25 am Melbourne
    expect(freshUntil(dayOf, tonight).getTime()).toBeGreaterThan(tonight.getTime())
  })
  it('no agreeing read: never fresh', () => {
    expect(freshUntil(null, new Date('2026-12-01T09:00:00Z')).getTime()).toBe(0)
  })
  it('a Melbourne day starts at its own midnight, daylight time or not', () => {
    expect(iso(startOfDayIn(new Date('2026-11-16T09:00:00Z'), 'Australia/Melbourne'))).toBe('2026-11-15T13:00:00.000Z')
    expect(iso(startOfDayIn(new Date('2026-06-16T09:00:00Z'), 'Australia/Melbourne'))).toBe('2026-06-15T14:00:00.000Z')
  })
  it('the migration states the same tiers', () => {
    const sql = readFileSync('supabase/migrations/20261115091001_same_day_verification.sql', 'utf8')
    for (const line of [
      "when rd + interval '30 days' < p_start - interval '30 days' then rd + interval '30 days'",
      "when greatest(rd + interval '7 days', p_start - interval '30 days') < p_start - interval '7 days'",
      "when greatest(rd + interval '2 days', p_start - interval '7 days') < p_start - interval '2 days'",
      "when rd < daystart then least(greatest(rd + interval '2 days', p_start - interval '2 days'), daystart + interval '6 hours')",
      "else greatest(rd + interval '2 days', p_start + interval '1 day')",
    ]) expect(sql).toContain(line)
  })
})

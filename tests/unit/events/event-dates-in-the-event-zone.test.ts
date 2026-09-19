import { describe, it, expect } from 'vitest'
import { formatEventDate, formatEventDateShort, PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import {
  judgeFile,
  missingExports,
  PINNED_UTC,
  RENDERING_TREES,
  REQUIRED_EXPORTS,
} from '../../../scripts/guards/event-dates-in-the-event-zone.mjs'

/**
 * EVERY MORNING EVENT IN AUSTRALIA SHOWED THE WRONG DAY.
 *
 * Eight components formatted an event's date with `timeZone: 'UTC'`. Any event
 * starting before 10:00 AEST (08:00 AWST) is on the PREVIOUS day in UTC, so the
 * card under a Saturday 09:00 gig read Friday. Found on 19 September 2026 by
 * reading a drive screenshot: a card read "FRI, 18 SEPT" for an event starting
 * Saturday 19 September at 09:00 AEST.
 *
 * The cases below use that exact instant, and each asserts BOTH what the shared
 * formatter says and what the deleted code said, so a regression reads as a
 * return to a named behaviour rather than as a string changing.
 */

/** Saturday 19 September 2026, 09:00 in Sydney. Friday 18 September in UTC. */
const SATURDAY_0900_SYDNEY = '2026-09-18T23:00:00.000Z'

/** What the eight components did. */
const asUtc = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

describe('an event date is the day the event happens', () => {
  it('reads a Saturday morning Sydney event as Saturday, where the UTC formatter said Friday', () => {
    expect(formatEventDateShort(SATURDAY_0900_SYDNEY, 'Australia/Sydney')).toContain('Sat')
    expect(formatEventDateShort(SATURDAY_0900_SYDNEY, 'Australia/Sydney')).toContain('19')
    // the deleted behaviour, pinned so a regression is recognisable
    expect(asUtc(SATURDAY_0900_SYDNEY)).toContain('Fri')
    expect(asUtc(SATURDAY_0900_SYDNEY)).toContain('18')
  })

  it('reads a Perth morning event in Perth, not in Sydney and not in UTC', () => {
    // Saturday 19 September 09:00 AWST is Saturday 01:00 UTC.
    const perthMorning = '2026-09-19T01:00:00.000Z'
    expect(formatEventDateShort(perthMorning, 'Australia/Perth')).toContain('Sat')
  })

  it('keeps a Perth late-night event on its own day rather than rolling it forward', () => {
    // Saturday 19 September 23:00 AWST is Saturday 15:00 UTC; in Sydney that is
    // Sunday 01:00. The event is on Saturday and says so.
    const perthLateNight = '2026-09-19T15:00:00.000Z'
    expect(formatEventDateShort(perthLateNight, 'Australia/Perth')).toContain('Sat')
    expect(formatEventDateShort(perthLateNight, 'Australia/Sydney')).toContain('Sun')
  })

  it('falls back to the platform zone when an event carries none, never to the runtime', () => {
    expect(formatEventDateShort(SATURDAY_0900_SYDNEY, null)).toBe(
      formatEventDateShort(SATURDAY_0900_SYDNEY, PLATFORM_TIME_ZONE),
    )
  })

  it('carries the year where a surface asks for one, still in the event zone', () => {
    const withYear = formatEventDate(SATURDAY_0900_SYDNEY, 'Australia/Sydney')
    expect(withYear).toContain('2026')
    expect(withYear).toContain('Sat')
  })
})

describe('the guard that keeps it that way', () => {
  it('refuses a rendering file that pins a date to UTC', () => {
    const verdict = judgeFile(
      'src/components/features/events/event-card.tsx',
      "const d = new Date(iso).toLocaleDateString('en-AU', { timeZone: 'UTC' })",
    )
    expect(verdict.ok).toBe(false)
    expect('reason' in verdict && verdict.reason).toContain('PREVIOUS DAY')
  })

  it('names the line, because a guard that says only the file makes somebody search', () => {
    const verdict = judgeFile('src/app/x/page.tsx', ["const a = 1", "b({ timeZone: 'UTC' })"].join('\n'))
    expect('reason' in verdict && verdict.reason).toContain(':2')
  })

  it('accepts a rendering file that uses the shared formatter', () => {
    expect(judgeFile('src/components/x.tsx', 'formatEventDateShort(e.start_date, e.timezone)').ok).toBe(true)
  })

  it('accepts a named constant, which is the deliberate act the rule wants', () => {
    // draft-event-preview.tsx writes `const DRAFT_ZONE = 'UTC'` with its reason.
    expect(judgeFile('src/components/launch/draft-event-preview.tsx', "timeZone: DRAFT_ZONE,").ok).toBe(true)
  })

  it('matches both quote styles, because a formatter rewrite changes them', () => {
    expect(PINNED_UTC.test('timeZone: "UTC"')).toBe(true)
    expect(PINNED_UTC.test("timeZone: 'UTC'")).toBe(true)
  })

  it('notices the formatter being renamed out from under everything sent to it', () => {
    expect(missingExports('export function formatEventDate() {}')).toEqual(['formatEventDateShort'])
    expect(missingExports(REQUIRED_EXPORTS.map(n => `export function ${n}() {}`).join('\n'))).toEqual([])
  })

  it('watches both trees that render for a reader', () => {
    expect(RENDERING_TREES).toEqual(['src/components', 'src/app'])
  })
})

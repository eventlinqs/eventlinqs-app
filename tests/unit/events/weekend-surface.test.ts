/**
 * THE WEEKEND SURFACE: THE WINDOW IS STILL NARROWED BY THE LISTING RULE, AND A
 * CARD IS FILED UNDER THE DAY IT ACTUALLY HAPPENS.
 *
 * ============================================================================
 * THE TWO DEFECTS THESE CASES PIN, BOTH FOUND WHILE BUILDING /this-weekend
 * ============================================================================
 *
 * ONE. THE PRESET REPLACED THE LISTING RULE INSTEAD OF NARROWING IT. Both public
 * fetchers carried `if (presetWindow) { bounds } else { listing window }`. The
 * founder's ruling of 16 August 2026 is that discovery shows an event until it
 * has ACTUALLY ENDED, and written as an `else` that ruling was skipped the
 * moment a reader chose a date preset. The homepage rail "On this weekend"
 * filters rows that HAVE been through the listing window; its own "View all"
 * went to `/events?preset=weekend`, which had not. The two disagreed by exactly
 * the events that had already finished.
 *
 * TWO. A DAY HEADING COMPUTED IN THE PLATFORM ZONE OVER CARDS COMPUTED IN THEIR
 * OWN. Every card on the platform prints its date in the EVENT's zone, by the
 * rule closed a day earlier after eight components printed the UTC day. A
 * heading that used the platform zone would put a card reading "SAT" under a
 * "Sunday" heading for any Western Australian event late on a Saturday night.
 *
 * Each case below states what the DELETED behaviour answered as well as what
 * the shipped one does, so a regression reads as a return to a named behaviour
 * rather than as a number changing.
 */
import { describe, test, expect } from 'vitest'
import { applyDateWindow, presetWindow } from '@/lib/events/fetchers'
import { listingWindowOrPredicate, weekendWindowUtc } from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import {
  WEEKEND_SURFACE_PATH,
  describeWeekend,
  groupWeekendByDay,
} from '@/lib/events/weekend-surface'
import type { PublicEventRow } from '@/lib/events/types'

/** A query builder that records what was asked of it, in order. */
function recorder() {
  const calls: string[] = []
  const self = {
    gte(column: string, value: string) {
      calls.push(`gte:${column}`)
      void value
      return self
    },
    lte(column: string, value: string) {
      calls.push(`lte:${column}`)
      void value
      return self
    },
    or(filters: string) {
      calls.push(`or:${filters.slice(0, 13)}`)
      return self
    },
    calls,
  }
  return self
}

/** The minimum of a public row the grouping reads. */
function row(over: Partial<PublicEventRow> & { start_date: string }): PublicEventRow {
  return {
    id: over.id ?? `id-${over.start_date}`,
    slug: over.slug ?? 'lane-c-event',
    title: over.title ?? 'Lane C Event',
    summary: null,
    description: null,
    cover_image_url: null,
    thumbnail_url: null,
    gallery_urls: null,
    end_date: null,
    timezone: over.timezone ?? 'Australia/Sydney',
    venue_name: null,
    venue_city: null,
    venue_country: null,
    venue_latitude: null,
    venue_longitude: null,
    created_at: '2026-09-01T00:00:00.000Z',
    is_free: null,
    category: null,
    organisation: null,
    ticket_tiers: [],
    ...over,
  } as PublicEventRow
}

describe('a date preset narrows the listing window, it does not replace it', () => {
  const now = new Date('2026-09-19T05:56:00.000Z') // Saturday 15:56 in Melbourne

  test('weekend_preset_still_asks_whether_the_event_has_ended', () => {
    const q = recorder()
    applyDateWindow(q, 'weekend', now)
    // The DELETED code produced exactly ['gte:start_date', 'lte:start_date'].
    // The `or` is the founder's rule and it was the branch not taken.
    expect(q.calls).toEqual([
      'gte:start_date',
      'lte:start_date',
      `or:${listingWindowOrPredicate(now).slice(0, 13)}`,
    ])
  })

  test('every_preset_gets_the_listing_rule_not_just_the_weekend', () => {
    for (const preset of ['today', 'tomorrow', 'weekend', '7d', 'month']) {
      const q = recorder()
      applyDateWindow(q, preset, now)
      expect(q.calls.filter(c => c.startsWith('or:'))).toHaveLength(1)
    }
  })

  test('no_preset_is_unchanged_and_asks_only_the_listing_rule', () => {
    for (const preset of [undefined, 'all', 'free']) {
      const q = recorder()
      applyDateWindow(q, preset, now)
      expect(q.calls).toEqual([`or:${listingWindowOrPredicate(now).slice(0, 13)}`])
    }
    // And the reason there is no bound: `presetWindow` answers null for all three.
    expect(presetWindow('free', now)).toBeNull()
  })

  test('the_bound_is_the_shared_weekend_and_nothing_else', () => {
    const shared = weekendWindowUtc(now, PLATFORM_TIME_ZONE)
    const window = presetWindow('weekend', now)
    expect(window?.from).toBe(shared.from.toISOString())
    expect(window?.to).toBe(shared.to.toISOString())
  })
})

describe('the weekend is described from the window, not from the events', () => {
  test('a_weekend_inside_one_month_names_the_month_once', () => {
    const { from, to } = weekendWindowUtc(new Date('2026-09-19T05:56:00.000Z'), PLATFORM_TIME_ZONE)
    expect(describeWeekend(from, to)).toBe('Saturday 19 and Sunday 20 September')
  })

  test('a_weekend_that_straddles_a_month_names_both', () => {
    // 31 October 2026 is a Saturday, so this weekend runs into November.
    const { from, to } = weekendWindowUtc(new Date('2026-10-29T03:00:00.000Z'), PLATFORM_TIME_ZONE)
    expect(describeWeekend(from, to)).toBe('Saturday 31 October and Sunday 1 November')
  })

  test('it_says_which_weekend_even_when_nothing_is_on', () => {
    const { from, to } = weekendWindowUtc(new Date('2026-09-19T05:56:00.000Z'), PLATFORM_TIME_ZONE)
    expect(describeWeekend(from, to)).toContain('Saturday')
    expect(groupWeekendByDay([])).toEqual([])
  })
})

describe('an event is filed under the day it happens in its own zone', () => {
  test('two_days_come_back_in_order_with_their_own_headings', () => {
    const days = groupWeekendByDay([
      row({ id: 'sun', start_date: '2026-09-20T02:00:00.000Z' }), // Sunday 12:00 AEST
      row({ id: 'sat', start_date: '2026-09-18T23:00:00.000Z' }), // Saturday 09:00 AEST
      row({ id: 'sat2', start_date: '2026-09-19T10:00:00.000Z' }), // Saturday 20:00 AEST
    ])
    expect(days.map(d => d.key)).toEqual(['2026-09-19', '2026-09-20'])
    expect(days.map(d => d.heading)).toEqual(['Saturday 19 September', 'Sunday 20 September'])
    expect(days[0].events.map(e => e.id)).toEqual(['sat', 'sat2'])
    expect(days[1].events.map(e => e.id)).toEqual(['sun'])
  })

  test('a_perth_event_keeps_its_own_day_and_does_not_borrow_sydneys', () => {
    /*
     * Saturday 22:00 in Perth is 2026-09-19T14:00Z, which is SUNDAY 00:00 in
     * Sydney. The platform-zone window admits it, and its own card reads
     * "SAT, 19 SEPT" because the card formats in the event's zone. A heading
     * computed in the platform zone would have filed it under Sunday.
     */
    const perth = row({ id: 'perth', start_date: '2026-09-19T14:00:00.000Z', timezone: 'Australia/Perth' })
    const [day] = groupWeekendByDay([perth])
    expect(day.key).toBe('2026-09-19')
    expect(day.heading).toBe('Saturday 19 September')

    // The same instant, read in the platform zone, is the day this must NOT use.
    const sydney = new Intl.DateTimeFormat('en-CA', {
      timeZone: PLATFORM_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(perth.start_date))
    expect(sydney).toBe('2026-09-20')
  })

  test('a_late_friday_in_perth_is_inside_the_window_and_says_friday', () => {
    /*
     * The window opens at Saturday 00:00 AEST, which is Friday 22:00 AWST. A
     * Perth event at that instant is genuinely inside the national weekend and
     * genuinely happens on a Friday, and the page says so rather than relabelling
     * it. Stated in the module header as a consequence; pinned here so it cannot
     * be "fixed" into a contradiction with the card.
     */
    const { from } = weekendWindowUtc(new Date('2026-09-19T05:56:00.000Z'), PLATFORM_TIME_ZONE)
    const [day] = groupWeekendByDay([
      row({ id: 'perth-fri', start_date: from.toISOString(), timezone: 'Australia/Perth' }),
    ])
    expect(day.heading).toBe('Friday 18 September')
  })

  test('a_null_zone_falls_back_to_the_platform_zone_and_is_never_dropped', () => {
    const days = groupWeekendByDay([
      row({ id: 'nozone', start_date: '2026-09-18T23:00:00.000Z', timezone: null }),
    ])
    expect(days).toHaveLength(1)
    expect(days[0].heading).toBe('Saturday 19 September')
  })

  test('the_path_is_written_once_and_is_the_route_that_exists', () => {
    expect(WEEKEND_SURFACE_PATH).toBe('/this-weekend')
  })
})

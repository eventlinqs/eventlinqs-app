import { describe, expect, test } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import type { PosterFacts } from '@/lib/social/campaign'
import { posterDrift, type NightNow } from '@/lib/social/daily-posters'

/*
 * A DAILY POSTER'S FACTS RE-READ AT APPROVAL (J15; the daily poster directive's correction 2): every fact it prints is
 * read again from the night, and an admission that moved is refused, because the poster's chips, and any FREE badge,
 * would no longer be true.
 */

const facts: PosterFacts = {
  title: 'Jackpot Trivia',
  startDate: '2026-11-05T08:00:00Z',
  endDate: null,
  timezone: 'Australia/Melbourne',
  cityName: 'Geelong',
  venueName: 'Elephant & Castle',
  venueAddress: '158 McKillop St, Geelong VIC 3220',
  cta: ctaFor({ entryMode: 'walk_in' }),
  priceLine: null,
  isAgeRestricted: false,
  ageMin: null,
  shortLink: 'eventlinqs.com.au/e/VlekjUhway',
}
const night: NightNow = {
  title: 'Jackpot Trivia',
  start_date: '2026-11-05T08:00:00+00:00',
  end_date: '2026-11-05T11:00:00+00:00',
  status: 'published',
  visibility: 'public',
  venue_name: 'Elephant & Castle',
  venue_address: '158 McKillop St, Geelong VIC 3220',
  is_age_restricted: false,
  age_restriction_min: null,
}
const NOW = new Date('2026-11-04T00:00:00Z')
const free = { state: 'free_open', priceLine: null }

describe('a daily poster at approval', () => {
  test('a night that still says the same: nothing to say', () => {
    expect(posterDrift(facts, night, free, NOW)).toEqual([])
  })

  test('a FREE badge that is no longer true is refused: the night now has no stated admission', () => {
    expect(posterDrift(facts, night, { state: 'unknown_price', priceLine: null }, NOW)).toEqual([
      'Jackpot Trivia: its admission has changed, so its chips and any FREE badge would no longer be true.',
    ])
  })

  test('each printed fact that moved is named', () => {
    const moved: NightNow = { ...night, title: 'Jackpot Trivia Night', start_date: '2026-11-05T09:00:00Z', venue_address: '160 McKillop St, Geelong VIC 3220', is_age_restricted: true, age_restriction_min: 18 }
    expect(posterDrift(facts, moved, free, NOW)).toEqual([
      'Jackpot Trivia: its title is now "Jackpot Trivia Night".',
      'Jackpot Trivia: its date or time has changed.',
      'Jackpot Trivia: its venue or street has changed.',
      'Jackpot Trivia: its age restriction has changed.',
    ])
  })

  test('a night no longer public, or over, is said', () => {
    expect(posterDrift(facts, { ...night, visibility: 'unlisted' }, free, NOW)).toEqual(['Jackpot Trivia: it is no longer published and public.'])
    expect(posterDrift(facts, night, free, new Date('2026-11-06T00:00:00Z'))).toEqual(['Jackpot Trivia: it has ended.'])
  })
})

import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ctaFor } from '@/lib/events/cta'
import type { CampaignNight } from '@/lib/social/campaign'
import { planLifecyclePieces } from '@/lib/social/lifecycle-plan'

/*
 * THE FEED DAY LINE, FROM THE RECORD'S OWN DATE AND TIMES (the PM's RETURN of 15:30 on piece da22e104, A Moment of Sanity:
 * its feed caption read '📅 Tuesday, Tue 24 Nov, 7pm to 9pm'; Lawal's 16:04 of 23 November 2026: one format for every feed
 * post, '📅 Tuesday 24 November, 7pm to 9pm', the weekday once, the month in full, the end time when the record holds one).
 * End to end through the lifecycle planner, each night drawn the day before it: on main each of these read the weekday
 * twice ('Tuesday, Tue 1 Dec').
 */

const MONDAY = new Date('2026-11-30T01:00:00Z') // noon on Monday 30 November, Melbourne

const night = (over: Partial<CampaignNight>): CampaignNight => ({
  eventId: 'e-night',
  slug: 'a-night',
  title: 'A Moment of Sanity',
  startDate: '2026-12-01T08:00:00Z',
  endDate: '2026-12-01T10:00:00Z',
  timezone: 'Australia/Melbourne',
  citySlug: 'melbourne',
  cityName: 'Melbourne',
  venueName: 'Thornbury Apothecary',
  placeName: 'Thornbury Apothecary',
  host: 'Thornbury Apothecary',
  categorySlug: 'wellness',
  summary: null,
  approvedPhotoUrl: null,
  photoCredit: null,
  cta: ctaFor({ isFree: true }),
  priceLine: 'Free',
  listedAt: '2026-11-01T00:00:00Z',
  seriesId: null,
  ...over,
})

/** The planner's reads, as the lifecycle planner test answers them: no history, no organisers, two permitted photographs. */
function fakeDb(eventId: string): SupabaseClient {
  const chain = (data: unknown[]) => {
    let platformRead = false
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'not', 'neq', 'or', 'order', 'limit', 'in', 'range', 'gt', 'lte']) b[m] = () => b
    b.eq = (col: string) => {
      if (col === 'is_test' || col === 'slug') platformRead = true
      return b
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: platformRead ? [] : data, error: null })
    return b
  }
  const photos = [1, 2].map((i) => ({ event_id: eventId, asset_id: `p${i}`, asset_url: `https://x/${eventId}-${i}.jpg`, asset_type: 'photo', lead_rank: i, source_width: 1080, source_height: 1350 }))
  return {
    from: (table: string) => {
      if (['social_pieces', 'organisers', 'organisations', 'social_piece_postings', 'social_piece_schedules', 'social_assets', 'events'].includes(table)) return chain([])
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (name: string) => {
      if (name !== 'social_usable_images_all') throw new Error(`unexpected rpc ${name}`)
      return { data: photos, error: null }
    },
  } as unknown as SupabaseClient
}

async function dayLines(n: CampaignNight, now: Date = MONDAY): Promise<{ feed: string[]; story: string | null }> {
  const { pieces, notes } = await planLifecyclePieces(fakeDb(n.eventId), { now, nights: [n], origin: 'https://www.eventlinqs.com.au' })
  const line = (caption: string) => caption.split('\n').find((l) => l.startsWith('\u{1F4C5}')) ?? ''
  const feed = pieces.find((p) => p.format === 'feed')
  if (!feed) throw new Error(`no feed drawn: ${pieces.map((p) => p.momentKey).join(', ')} ${notes.join(' ')}`)
  const story = pieces.find((p) => p.format === 'story')
  return { feed: [line(feed.versions.instagram.caption), line(feed.versions.facebook.caption)], story: story ? line(story.versions.instagram.caption) : null }
}

describe("a feed post's day line, from the record's own date and times", () => {
  it('a one day night: the weekday once, the month in full, its start and end', async () => {
    const { feed, story } = await dayLines(night({}))
    expect(feed).toEqual(['\u{1F4C5} Tuesday 1 December, 7pm to 9pm', '\u{1F4C5} Tuesday 1 December, 7pm to 9pm'])
    // A story expires within its day, so it keeps its day word beside its date.
    if (story !== null) expect(story).toBe('\u{1F4C5} Tomorrow, Tue 1 Dec, 7pm to 9pm')
  })

  it('a night past midnight is one night, dated by the day it starts, its end the next morning', async () => {
    const { feed } = await dayLines(night({ eventId: 'e-late', startDate: '2026-12-01T11:00:00Z', endDate: '2026-12-01T15:00:00Z' }))
    expect(feed[0]).toBe('\u{1F4C5} Tuesday 1 December, 10pm to 2am')
  })

  it('an event over several days reads as its run, with the hours of the day it opens', async () => {
    const run = night({ eventId: 'e-run', title: 'Harbour Lights Festival', venueName: 'Eastern Beach', placeName: 'Eastern Beach', host: 'Eastern Beach', startDate: '2026-12-01T00:00:00Z', endDate: '2026-12-02T09:00:00Z' })
    const { feed } = await dayLines(run)
    expect(feed[0]).toBe('\u{1F4C5} Tuesday 1 to Wednesday 2 December, 11am to 8pm')
  })
})

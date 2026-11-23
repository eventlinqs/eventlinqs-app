import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ctaFor } from '@/lib/events/cta'
import { nightMaker, presenterNamedIn } from '@/lib/listings/shown-organiser'
import type { CampaignNight } from '@/lib/social/campaign'
import { planLifecyclePieces } from '@/lib/social/lifecycle-plan'

/*
 * THE PM'S VERIFY OF 23 NOVEMBER 2026 ON PIECE da22e104 (A Moment of Sanity, a listing at Thornbury Apothecary): its feed
 * caption read 'A Moment of Sanity, by Thornbury Apothecary', the venue named as the night's maker (n.host is the venue for a
 * listing, ruling A of 23 October 2026), over '📅 Tuesday, Tue 24 Nov, 7pm to 9pm', the weekday twice. A caption's 'by'
 * names only the organiser the night itself names; a feed's day line says its day once.
 */

describe("who puts a night on (shown-organiser.ts nightMaker), never where it is", () => {
  const listing = { listing_source: 'eventlinqs' }
  const listingsOrg = { name: 'EventLinqs Listings', slug: 'eventlinqs-listings' }

  it("an organiser's own night names its organisation", () => {
    expect(nightMaker({ listing_source: null }, { name: 'GroovyTown Wellbeing', slug: 'groovytown' })).toBe('GroovyTown Wellbeing')
  })

  it('a listing names the host its metadata records, else the organiser its own words name, else nobody', () => {
    expect(nightMaker({ ...listing, metadata: { host_name: 'Asia Oasis' } }, listingsOrg)).toBe('Asia Oasis')
    expect(nightMaker({ ...listing, metadata: {}, words: [null, 'An hour of breath and sound, hosted by GroovyTown Wellbeing at Thornbury Apothecary.'] }, listingsOrg)).toBe('GroovyTown Wellbeing')
    expect(nightMaker({ ...listing, metadata: { host_name: '  ' }, words: ['A night of jazz at the bar.'] }, listingsOrg)).toBeNull()
    // The listings organisation is never anyone's maker, and a listing's venue is never named for want of one.
    expect(nightMaker({ listing_source: null, metadata: null }, listingsOrg)).toBeNull()
  })

  it("reads only a name in capitals right after the words that say who puts it on", () => {
    expect(presenterNamedIn('Presented by Melbourne Recital Centre.')).toBe('Melbourne Recital Centre')
    expect(presenterNamedIn('<p>Proudly brought to you by Ocean Grove Calisthenic College &amp; Friends, all welcome</p>')).toBe('Ocean Grove Calisthenic College & Friends')
    expect(presenterNamedIn('Organised by The Jazz Alchemists; doors at 7.')).toBe('The Jazz Alchemists')
    // A person named with the organisation they are of: the organisation puts the night on (the PM's RETURN of 15:30).
    expect(presenterNamedIn("A women's evening hosted by Berenice Franklin of GroovyTown Wellbeing.")).toBe('GroovyTown Wellbeing')
    expect(presenterNamedIn('Your host is Berenice Franklin (GroovyTown Wellbeing).')).toBe('GroovyTown Wellbeing')
    expect(presenterNamedIn('Facilitated by Berenice Franklin from GroovyTown Wellbeing, all welcome')).toBe('GroovyTown Wellbeing')
    for (const none of ['Run by volunteers from the neighbourhood.', 'A sound bath at Thornbury Apothecary.', 'hosted by the local choir', null, '']) {
      expect(presenterNamedIn(none), String(none)).toBeNull()
    }
  })
})

const MONDAY = new Date('2026-11-30T01:00:00Z') // noon on Monday 30 November, Melbourne: the day before the night

const sanity: CampaignNight = {
  eventId: 'e-sanity',
  slug: 'a-moment-of-sanity',
  title: 'A Moment of Sanity',
  // 7 pm to 9 pm on Tuesday 1 December, Melbourne.
  startDate: '2026-12-01T08:00:00Z',
  endDate: '2026-12-01T10:00:00Z',
  timezone: 'Australia/Melbourne',
  citySlug: 'melbourne',
  cityName: 'Melbourne',
  venueName: 'Thornbury Apothecary',
  placeName: 'Thornbury Apothecary',
  host: 'Thornbury Apothecary',
  organiser: null,
  categorySlug: 'wellness',
  summary: null,
  approvedPhotoUrl: null,
  photoCredit: null,
  cta: ctaFor({ isFree: true }),
  priceLine: 'Free',
  listedAt: '2026-11-01T00:00:00Z',
  seriesId: null,
}

/** The planner's reads as the lifecycle planner test answers them; 'events' answers each night's own description. */
function fakeDb(words: unknown[]): SupabaseClient {
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
  const photos = [1, 2].map((i) => ({ event_id: 'e-sanity', asset_id: `s${i}`, asset_url: `https://x/sanity-${i}.jpg`, asset_type: 'photo', lead_rank: i, source_width: 1080, source_height: 1350 }))
  return {
    from: (table: string) => {
      if (['social_pieces', 'organisers', 'organisations', 'social_piece_postings', 'social_piece_schedules', 'social_assets'].includes(table)) return chain([])
      // The season's ended nights (none) and each chosen night's own description, one read each; a description row is
      // never a night of the season here, as the planner reads only nights it does not hold.
      if (table === 'events') return chain(words)
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (name: string) => {
      if (name !== 'social_usable_images_all') throw new Error(`unexpected rpc ${name}`)
      return { data: photos, error: null }
    },
  } as unknown as SupabaseClient
}
const dated = (caption: string) => caption.split('\n').find((l) => l.startsWith('\u{1F4C5}'))
const plan = (night: CampaignNight, words: unknown[] = []) => planLifecyclePieces(fakeDb(words), { now: MONDAY, nights: [night], origin: 'https://www.eventlinqs.com.au' })

describe("a lifecycle caption's maker and day line, end to end", () => {
  it("names the organiser the night's own words name, never the venue, and says the feed's day once", async () => {
    // A hired venue: the listing names its host and the organisation she is of (the PM's RETURN of 15:30; main read 'by Thornbury Apothecary').
    const { pieces, notes } = await plan(sanity, [{ id: 'e-sanity', description: "A women's evening of breath and sound at Thornbury Apothecary, hosted by Berenice Franklin of GroovyTown Wellbeing." }])
    const feed = pieces.find((p) => p.format === 'feed')
    if (!feed) throw new Error(`no feed drawn: ${pieces.map((p) => p.momentKey).join(', ')} ${notes.join(' ')}`)
    for (const caption of [feed.versions.instagram.caption, feed.versions.facebook.caption]) {
      expect(caption).toContain('A Moment of Sanity, by GroovyTown Wellbeing\n')
      expect(caption).not.toContain('by Thornbury Apothecary')
      expect(dated(caption)).toBe('\u{1F4C5} Tuesday 1 December, 7pm to 9pm')
    }
    // A story expires within its day, so it keeps its day word beside its date.
    const story = pieces.find((p) => p.format === 'story')
    if (story) expect(dated(story.versions.instagram.caption)).toBe('\u{1F4C5} Tomorrow, Tue 1 Dec, 7pm to 9pm')
  })

  it('with no organiser named, the title stands alone: the venue is never named as its maker', async () => {
    const { pieces } = await plan(sanity)
    const feed = pieces.find((p) => p.format === 'feed')
    if (!feed) throw new Error('no feed drawn')
    expect(feed.versions.instagram.caption.split('\n')).toContain('A Moment of Sanity')
    expect(feed.versions.instagram.caption).not.toMatch(/, by /)
  })

  it('a venue that runs its own night is named, as its maker', async () => {
    const own = { ...sanity, eventId: 'e-sanity', title: 'Full Moon Apothecary Night', organiser: nightMaker({ listing_source: null }, { name: 'Thornbury Apothecary', slug: 'thornbury-apothecary' }) }
    const { pieces } = await plan(own)
    expect(pieces.find((p) => p.format === 'feed')?.versions.instagram.caption).toContain('Full Moon Apothecary Night, by Thornbury Apothecary\n')
  })

  it("an organiser the night's read already names (its own organisation, or the host its listing records) is named", async () => {
    const { pieces } = await plan({ ...sanity, organiser: 'GroovyTown Wellbeing' })
    expect(pieces.find((p) => p.format === 'feed')?.versions.instagram.caption).toContain('A Moment of Sanity, by GroovyTown Wellbeing\n')
  })
})

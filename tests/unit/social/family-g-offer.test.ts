import { describe, expect, it, vi } from 'vitest'
// These tests prove the earlier families' own rules, kept behind EARLIER_FAMILIES_ON (law 13); law 37's hold over the same
// pieces is proved in law37.test.ts and by the guard law37-only, so here alone its refusal is set aside.
vi.mock('@/lib/social/law37', async (orig) => ({ ...(await orig<typeof import('@/lib/social/law37')>()), law37Refusal: () => null }))
import { ctaFor } from '@/lib/events/cta'
import { ORGANISER_OFFER_FILE, ORGANISER_OFFER_SHOWS_UNTIL, planCampaign, pieceRefusal, type CampaignNight } from '@/lib/social/campaign'
import { captionMarkFaults } from '@/lib/social/caption-marks'
import { languageFaults, pieceQuality } from '@/lib/social/piece-quality'

/*
 * FAMILY G, THE ORGANISER OFFER AS LAWAL APPROVED IT (the PM's 23:38 of 18 November 2026, item 3; law 26): the organiser
 * piece posts the approved master 13 file unchanged (its 4:5 version, 1440 x 1800, both feeds) with caption standard
 * version 2's captions from Lawal's approved organiser words, and is refused after the end of Saturday 5 December 2026 in
 * Melbourne, the night of the live event page in its phone, until a new capture is approved.
 */
const night = (startDate: string): CampaignNight =>
  ({
    eventId: `n-${startDate}`, slug: `n-${startDate}`, title: 'A Night', startDate, endDate: null, timezone: 'Australia/Melbourne',
    citySlug: 'melbourne', cityName: 'Melbourne', venueName: 'Forum Melbourne', host: 'Forum Melbourne', categorySlug: 'music',
    summary: null, approvedPhotoUrl: null, photoCredit: null, cta: ctaFor({ tiers: [{ price: 4500 }] }), priceLine: 'From $45',
  }) as unknown as CampaignNight
const ORIGIN = 'https://www.eventlinqs.com.au'
const offerOf = (weekStart: string, at: string) =>
  planCampaign({ nights: [night(at)], cities: [{ slug: 'melbourne', name: 'Melbourne' }], weekStart, origin: ORIGIN }).pieces.find((p) => p.kind === 'organiser_campaign')

describe('family G: the approved organiser offer, unchanged', () => {
  const offer = offerOf('2026-11-23', '2026-11-25T09:00:00Z')!
  it('posts the approved file as it is, never a drawn slide', () => {
    expect(offer.slides).toEqual([{ t: 'file', composition: 'close', url: ORGANISER_OFFER_FILE, format: 'feed', eventId: null, startDate: null }])
    expect(ORGANISER_OFFER_FILE).toBe('https://www.eventlinqs.com.au/social/approved/organisers-feed-ig45.jpg')
    expect(pieceRefusal(offer)).toBeNull()
  })
  it("its captions are caption standard version 2's, Lawal's approved words, with the marks and our tags", () => {
    expect(offer.versions.instagram.caption).toBe(
      [
        '\u{1F4E3} Reach people beyond your own followers.',
        "List your event on EventLinqs: get discovered on your city's guide, sell tickets, promote it with your launch kit, and keep every attendee relationship yours.",
        'Free events stay free.',
        '\u{1F39F} List your event: link in our bio',
        'Send this to an organiser you know.',
        '#VictoriaEvents #EventLinqs',
      ].join('\n'),
    )
    expect(offer.versions.facebook.caption).toContain(`\u{1F39F} List your event:\n${ORIGIN}/organisers\nSend this to an organiser you know.`)
    for (const c of [offer.versions.instagram.caption, offer.versions.facebook.caption]) {
      expect(captionMarkFaults(c)).toEqual([])
      expect(languageFaults(c.split('\n'))).toEqual([])
    }
  })
  it('no week that starts after 5 December draws it', () => {
    expect(offerOf('2026-11-30', '2026-12-02T09:00:00Z')).toBeDefined()
    expect(offerOf('2026-12-07', '2026-12-09T09:00:00Z')).toBeUndefined()
  })
  it('the publish gate passes it on 5 December and refuses it from midnight that night in Melbourne', () => {
    const at = (iso: string) => pieceQuality({ slides: offer.slides, caption: offer.caption, madeAt: '2026-11-19T00:00:00Z', nights: new Map(), now: new Date(iso) })
    expect(ORGANISER_OFFER_SHOWS_UNTIL).toBe('2026-12-05T13:00:00.000Z')
    expect(at('2026-12-05T12:59:00Z')).toEqual([])
    expect(at('2026-12-05T13:00:00Z')).toEqual(['[night] The approved organiser offer shows a live event page of Saturday 5 December 2026, and that day is over; it is not posted again until a new capture is approved.'])
  })
})

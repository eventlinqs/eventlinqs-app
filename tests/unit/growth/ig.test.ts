import { describe, expect, it } from 'vitest'
import { IG_DAYS, igHref, igPicks, type IgNight, type IgPost } from '@/lib/growth/ig-math'
import { readArrival } from '@/lib/growth/arrival'
import { channelForVisit } from '@/lib/growth/traffic-channel'
import { LIST_END_LEAD_MS } from '@/lib/events/listing-window'

/**
 * /ig, the Instagram page (Lawal, 23 November 2026, 12:47): every event the engine posted to Instagram in the last 14
 * days whose night is still ahead and still public, newest post first, each event once, each to its own listing tagged
 * source instagram and the post's id. An event that has passed drops off by itself.
 */

const NOW = new Date('2026-11-23T02:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString()

function night(id: string, startIn: number, endIn: number | null, listing = id): IgNight {
  return { id, start_date: at(startIn), end_date: endIn === null ? null : at(endIn), timezone: 'Australia/Melbourne', listing }
}

function post(postId: string, eventIds: string[], postedAgo: number, over: Partial<IgPost> = {}): IgPost {
  return { postId, postUrl: `https://www.instagram.com/p/${postId}/`, postedAt: at(-postedAgo), eventIds, ...over }
}

const NIGHTS = new Map<string, IgNight>([
  ['ahead', night('ahead', 3 * DAY, 3 * DAY + 4 * 3600_000)],
  ['later', night('later', 9 * DAY, 9 * DAY + 3 * 3600_000)],
  ['passed', night('passed', -2 * DAY, -2 * DAY + 3 * 3600_000)],
  // On now: started yesterday, ends tomorrow. Still ahead until its end.
  ['running', night('running', -DAY, DAY)],
  // Ends inside the list's lead: a public list has already let it go (listing-window.ts).
  ['ending', night('ending', -3 * 3600_000, LIST_END_LEAD_MS - 60_000)],
  // A run of one listing, three nights.
  ['run-1', night('run-1', 2 * DAY, 2 * DAY + 3600_000, 'festival|park')],
  ['run-2', night('run-2', 3 * DAY, 3 * DAY + 3600_000, 'festival|park')],
  ['run-3', night('run-3', 4 * DAY, 4 * DAY + 3600_000, 'festival|park')],
])

describe('igPicks', () => {
  it('lists a night an Instagram post named, still ahead, credited to that post', () => {
    expect(igPicks([post('p1', ['ahead'], DAY)], NIGHTS, NOW)).toEqual([{ eventId: 'ahead', postId: 'p1', postedAt: at(-DAY), more: 0 }])
  })

  it('reads the last 14 days of posts only', () => {
    const inside = post('in', ['ahead'], (IG_DAYS - 1) * DAY)
    const outside = post('out', ['later'], (IG_DAYS + 1) * DAY)
    expect(igPicks([inside, outside], NIGHTS, NOW).map((p) => p.postId)).toEqual(['in'])
  })

  it('drops a night that has passed, or is inside the list lead, by itself', () => {
    expect(igPicks([post('p1', ['passed', 'ending'], DAY)], NIGHTS, NOW)).toEqual([])
    const tomorrow = new Date(NOW.getTime() + 4 * DAY)
    expect(igPicks([post('p1', ['ahead'], DAY)], NIGHTS, tomorrow)).toEqual([])
  })

  it('keeps a night that is on now until its end', () => {
    expect(igPicks([post('p1', ['running'], DAY)], NIGHTS, NOW).map((p) => p.eventId)).toEqual(['running'])
  })

  it('never lists a night the public read did not return (draft, private, removed, a test account)', () => {
    expect(igPicks([post('p1', ['not-public'], DAY)], NIGHTS, NOW)).toEqual([])
  })

  it('lists Instagram posts only, never a Facebook post or a partner kit marked sent', () => {
    expect(igPicks([post('fb', ['ahead'], DAY, { postUrl: 'https://www.facebook.com/123/posts/456' })], NIGHTS, NOW)).toEqual([])
    expect(igPicks([post('kit', ['ahead'], DAY, { postUrl: 'sent' })], NIGHTS, NOW)).toEqual([])
  })

  it('never lists a post recorded as going in the future', () => {
    expect(igPicks([post('p1', ['ahead'], -DAY)], NIGHTS, NOW)).toEqual([])
  })

  it('puts the newest post first', () => {
    const older = post('older', ['later'], 5 * DAY)
    const newer = post('newer', ['ahead'], DAY)
    expect(igPicks([older, newer], NIGHTS, NOW).map((p) => [p.postId, p.eventId])).toEqual([
      ['newer', 'ahead'],
      ['older', 'later'],
    ])
  })

  it('lists each event once, credited to its newest post, even when posted twice', () => {
    const first = post('first', ['ahead'], 6 * DAY)
    const again = post('again', ['ahead', 'later'], 2 * DAY)
    expect(igPicks([first, again], NIGHTS, NOW)).toEqual([
      { eventId: 'ahead', postId: 'again', postedAt: at(-2 * DAY), more: 0 },
      { eventId: 'later', postId: 'again', postedAt: at(-2 * DAY), more: 0 },
    ])
  })

  it('draws a run of one listing once, as its soonest night still ahead, with how many more the posts named', () => {
    const day3 = post('day3', ['run-3'], DAY)
    const day1and2 = post('day12', ['run-2', 'run-1'], 3 * DAY)
    expect(igPicks([day1and2, day3], NIGHTS, NOW)).toEqual([{ eventId: 'run-1', postId: 'day3', postedAt: at(-DAY), more: 2 }])
  })
})

describe('igHref', () => {
  it("tags the event's own listing with source instagram, medium social, campaign ig and the post's id", () => {
    const href = igHref('/events/amcf-2026', '70329a33-1111-4222-8333-444455556666')
    expect(href).toBe('/events/amcf-2026?utm_source=instagram&utm_medium=social&utm_campaign=ig&utm_content=70329a33-1111-4222-8333-444455556666')
  })

  it('stays on this site, on the listing path', () => {
    expect(igHref('/events/a-night', 'p1').startsWith('/events/a-night?')).toBe(true)
  })

  it('is what the visit ledger reads: organic social from instagram, the post id kept', () => {
    const arrival = readArrival({ url: `https://www.eventlinqs.com.au${igHref('/events/a-night', 'p1')}`, referrer: 'https://l.instagram.com/' })
    expect(arrival).toMatchObject({ utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'ig', utmContent: 'p1', landingPath: '/events/a-night' })
    expect(channelForVisit({ referrer: null, utmSource: arrival.utmSource, utmMedium: arrival.utmMedium, utmCampaign: arrival.utmCampaign })).toBe('organic-social')
  })
})

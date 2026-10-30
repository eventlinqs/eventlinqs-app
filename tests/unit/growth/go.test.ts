import { describe, expect, it } from 'vitest'
import { GO_PIECE_COOKIE_MAX_AGE_SECONDS, goDestination, liveGoLinks, NO_NIGHT_DAYS, pieceIdOf, pressDay, viaOf, type GoNight, type GoPieceRow } from '@/lib/growth/go-math'
import { CREDIT_DAYS } from '@/lib/social/results'

/**
 * /go, the link in bio (the engine plan of 28 October 2026, part H, and Lawal's final directive of that day). It lists
 * each live post's tracked link, and a press lands on the piece's own page on this site, never anywhere else.
 */

const NOW = new Date('2026-10-30T09:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const at = (msFromNow: number) => new Date(NOW.getTime() + msFromNow).toISOString()

function night(id: string, startIn: number, endIn: number, isPublic = true): GoNight {
  return { id, startDate: at(startIn), endDate: at(endIn), timezone: 'Australia/Melbourne', isPublic }
}

function piece(id: string, over: Partial<GoPieceRow> = {}): GoPieceRow {
  return {
    id,
    kind: 'weekend_carousel',
    city: 'melbourne',
    link: 'https://www.eventlinqs.com.au/city/melbourne',
    postUrl: 'https://www.instagram.com/p/abc123/',
    postedAt: at(-DAY),
    hook: 'Say yes to this weekend in Melbourne',
    nightIds: ['n1'],
    ...over,
  }
}

const NIGHTS = new Map<string, GoNight>([
  ['n1', night('n1', 2 * DAY, 2 * DAY + 4 * 3600_000)],
  ['n2', night('n2', -3 * DAY, -3 * DAY + 3600_000)],
  ['n3', night('n3', DAY, DAY + 3600_000, false)],
  ['n4', night('n4', 5 * DAY, 5 * DAY + 3600_000)],
])

describe('liveGoLinks', () => {
  it('lists a posted piece with a night still ahead, in its approved words, with the next night', () => {
    const links = liveGoLinks([piece('p1')], NIGHTS, NOW)
    expect(links).toEqual([{ pieceId: 'p1', words: 'Say yes to this weekend in Melbourne', nextNightStart: NIGHTS.get('n1')?.startDate, nextNightZone: 'Australia/Melbourne', postedAt: at(-DAY) }])
  })

  it('drops a piece whose nights have all ended, or are no longer public', () => {
    expect(liveGoLinks([piece('p1', { nightIds: ['n2'] })], NIGHTS, NOW)).toEqual([])
    expect(liveGoLinks([piece('p1', { nightIds: ['n3'] })], NIGHTS, NOW)).toEqual([])
    expect(liveGoLinks([piece('p1', { nightIds: ['gone'] })], NIGHTS, NOW)).toEqual([])
  })

  it('says the earliest night still ahead, not an ended or hidden one', () => {
    const [link] = liveGoLinks([piece('p1', { nightIds: ['n4', 'n2', 'n3', 'n1'] })], NIGHTS, NOW)
    expect(link.nextNightStart).toBe(NIGHTS.get('n1')?.startDate)
  })

  it('never lists a partner kit, a piece that was only sent, or one with no words', () => {
    expect(liveGoLinks([piece('p1', { kind: 'partner_kit' })], NIGHTS, NOW)).toEqual([])
    expect(liveGoLinks([piece('p1', { postUrl: 'sent' })], NIGHTS, NOW)).toEqual([])
    expect(liveGoLinks([piece('p1', { hook: '  ' })], NIGHTS, NOW)).toEqual([])
  })

  it('keeps a piece that names no night for its first days only', () => {
    const fresh = piece('o1', { kind: 'organiser_campaign', nightIds: [], postedAt: at(-(NO_NIGHT_DAYS - 1) * DAY) })
    const stale = piece('o2', { kind: 'organiser_campaign', nightIds: [], postedAt: at(-(NO_NIGHT_DAYS + 1) * DAY) })
    expect(liveGoLinks([fresh, stale], NIGHTS, NOW).map((l) => [l.pieceId, l.nextNightStart])).toEqual([['o1', null]])
  })

  it('never lists a piece recorded as going in the future', () => {
    expect(liveGoLinks([piece('p1', { postedAt: at(DAY) })], NIGHTS, NOW)).toEqual([])
  })

  it('puts the newest post first and lists each piece once', () => {
    const older = piece('p1', { postedAt: at(-3 * DAY) })
    const newer = piece('p2', { postedAt: at(-DAY) })
    expect(liveGoLinks([older, newer, older], NIGHTS, NOW).map((l) => l.pieceId)).toEqual(['p2', 'p1'])
  })
})

describe('goDestination', () => {
  const ORIGIN = 'https://www.eventlinqs.com.au'

  it('lands on the stored page, tagged for the visit ledger as social from the profile named', () => {
    const url = new URL(goDestination('https://www.eventlinqs.com.au/city/melbourne', ORIGIN, 'instagram'))
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/city/melbourne')
    expect(url.searchParams.get('utm_source')).toBe('instagram')
    expect(url.searchParams.get('utm_medium')).toBe('social')
    expect(url.searchParams.get('utm_campaign')).toBe('go')
  })

  it('keeps the stored query and replaces any host with this site, so it can never send a visitor elsewhere', () => {
    const url = new URL(goDestination('https://evil.example/events/a-night?x=1', ORIGIN, 'facebook'))
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/events/a-night')
    expect(url.searchParams.get('x')).toBe('1')
  })

  it('lands on /events when the stored link cannot be read', () => {
    for (const bad of [null, '', 'javascript:alert(1)', 'http://www.eventlinqs.com.au/x', 'not a url']) {
      expect(new URL(goDestination(bad, ORIGIN, 'other')).pathname).toBe('/events')
    }
  })

  it('stays on the preview it was opened on', () => {
    const url = new URL(goDestination('https://www.eventlinqs.com.au/for-organisers', 'https://eventlinqs-git-x.vercel.app', 'instagram'))
    expect(url.origin).toBe('https://eventlinqs-git-x.vercel.app')
    expect(url.pathname).toBe('/for-organisers')
  })
})

describe('viaOf and pressDay', () => {
  it('reads the profile from the link, Instagram when none is named, other for anything unknown', () => {
    expect(viaOf(null)).toBe('instagram')
    expect(viaOf('Facebook')).toBe('facebook')
    expect(viaOf('tiktok')).toBe('other')
  })

  it('counts a press on its Melbourne day, not the UTC one', () => {
    // 14:30 UTC on 30 October is 01:30 on 31 October in Melbourne (daylight time, UTC+11).
    expect(pressDay(new Date('2026-10-30T14:30:00Z'), 'Australia/Sydney')).toBe('2026-10-31')
  })
})

describe('the piece cookie a tap on /go sets', () => {
  it('holds a piece id only, and lasts the credit window', () => {
    expect(pieceIdOf('11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111')
    expect(pieceIdOf('nope')).toBeNull()
    expect(pieceIdOf(null)).toBeNull()
    expect(pieceIdOf(undefined)).toBeNull()
    expect(GO_PIECE_COOKIE_MAX_AGE_SECONDS).toBe(CREDIT_DAYS * 86_400)
  })
})

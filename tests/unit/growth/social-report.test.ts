import { describe, expect, it } from 'vitest'
import {
  buildSocialReport,
  MAX_RECOMMENDATIONS,
  type CampaignRow,
  type FigureRow,
  type PieceRow,
  type WeekCounted,
} from '@/lib/growth/social-report-math'
import { weekOf } from '@/lib/growth/weekly-math'

/**
 * J16, J17, G1 to G5 and K14 (the release checklist of 28 October 2026). The weekly report keeps what Instagram and
 * Facebook reported (entered by a person) apart from what EventLinqs counted, compares the earlier campaigns, says
 * plainly when there is no baseline, and proposes at most three changes, each with its data, none of them applied.
 */

const C1: CampaignRow = { id: 'c1', weekStart: '2026-10-19' }
const C2: CampaignRow = { id: 'c2', weekStart: '2026-10-26' }
const C3: CampaignRow = { id: 'c3', weekStart: '2026-11-02' }

const week = (over: Partial<WeekCounted> = {}): WeekCounted => ({
  visitors: 0,
  eventViews: 0,
  visitorsFromSocial: 0,
  externalBookingClicks: 0,
  nativeOrders: 0,
  nativeOrderCents: 0,
  subscriptions: 0,
  organiserEnquiries: 0,
  liveByCity: {},
  socialVisitorsByCity: {},
  ...over,
})

let n = 0
const piece = (campaignId: string, over: Partial<PieceRow> = {}): PieceRow => ({
  id: `p${++n}`,
  campaignId,
  kind: 'week_ahead',
  city: 'melbourne',
  audience: 'attendees',
  objective: 'audience_growth',
  outcome: 'Visits to the city page through this post',
  link: 'https://www.eventlinqs.com.au/city/melbourne',
  partnerName: null,
  postedAt: null,
  postUrl: null,
  countedLinkId: null,
  ...over,
})

const fig = (pieceId: string, platform: FigureRow['platform'], metric: FigureRow['metric'], value: number, readAt = '2026-10-30T09:00:00.000Z'): FigureRow => ({
  pieceId,
  platform,
  metric,
  value,
  readAt,
  enteredAt: readAt,
})

const NOW = new Date('2026-11-09T01:00:00.000Z')

describe('the weekly report with no baseline (today)', () => {
  it('shows no baseline, no comparison and no recommendation, and invents no figure', () => {
    const p = piece('c2')
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C2],
      pieces: [p],
      figures: [],
      linkEvents: [],
      orders: new Map(),
      counted: new Map([['c2', week({ visitors: 4, eventViews: 9 })]]),
      now: NOW,
    })
    expect(r.baseline).toBeNull()
    expect(r.baselineWords).toMatch(/No baseline yet/)
    expect(r.previous).toEqual([])
    expect(r.recommendations).toEqual([])
    expect(r.recommendationWords).toMatch(/No recommendation/)
    // The piece has not gone: nothing is entered for it, and nothing is shown as zero.
    expect(r.pieces[0].posted).toBe(false)
    expect(r.pieces[0].entered.instagram.reach).toBeNull()
    expect(r.pieces[0].entered.facebook.shares).toBeNull()
    expect(r.counted).toEqual(week({ visitors: 4, eventViews: 9 }))
  })

  it('a campaign week with no counted rows reads as not counted, never as zero', () => {
    const r = buildSocialReport({ campaignId: 'c2', campaigns: [C2], pieces: [], figures: [], linkEvents: [], orders: new Map(), counted: new Map(), now: NOW })
    expect(r.counted).toBeNull()
  })
})

describe('J16: entered figures', () => {
  it('the newest read of each piece, platform and metric is the figure, with when it was read', () => {
    const p = piece('c2', { postedAt: '2026-10-27T08:00:00.000Z', postUrl: 'https://www.instagram.com/p/abc/' })
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C2],
      pieces: [p],
      figures: [fig(p.id, 'instagram', 'reach', 100, '2026-10-28T09:00:00.000Z'), fig(p.id, 'instagram', 'reach', 340, '2026-10-30T09:00:00.000Z'), fig(p.id, 'instagram', 'saves', 7)],
      linkEvents: [],
      orders: new Map(),
      counted: new Map(),
      now: NOW,
    })
    expect(r.pieces[0].entered.instagram.reach).toEqual({ value: 340, readAt: '2026-10-30T09:00:00.000Z' })
    expect(r.pieces[0].entered.instagram.saves?.value).toBe(7)
    expect(r.pieces[0].entered.instagram.watch_time_seconds).toBeNull()
    expect(r.enteredTotals.instagram.reach).toEqual({ value: 340, pieces: 1 })
    expect(r.enteredTotals.facebook.reach).toBeNull()
  })

  it('a piece whose link does not count says so, and one with a counted link reports its own arrivals, presses out and orders', () => {
    const page = piece('c2', { postedAt: '2026-10-27T08:00:00.000Z' })
    const kit = piece('c2', { kind: 'partner_kit', postedAt: '2026-10-27T08:00:00.000Z', countedLinkId: 'L1' })
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C2],
      pieces: [page, kit],
      figures: [],
      linkEvents: [
        { linkId: 'L1', kind: 'click', orderId: null, occurredAt: '2026-10-27T10:00:00.000Z' },
        { linkId: 'L1', kind: 'click', orderId: null, occurredAt: '2026-10-27T11:00:00.000Z' },
        { linkId: 'L1', kind: 'outbound', orderId: null, occurredAt: '2026-10-27T11:01:00.000Z' },
        { linkId: 'L1', kind: 'conversion', orderId: 'o1', occurredAt: '2026-10-27T12:00:00.000Z' },
        // Before the piece went: not its own.
        { linkId: 'L1', kind: 'click', orderId: null, occurredAt: '2026-10-26T12:00:00.000Z' },
      ],
      orders: new Map([['o1', { id: 'o1', status: 'confirmed', totalCents: 4000, tickets: 2 }]]),
      counted: new Map(),
      now: NOW,
    })
    expect(r.pieces[0].counted).toBeNull()
    expect(r.pieces[0].countedWords).toMatch(/counted for the week only/)
    expect(r.pieces[1].counted).toEqual({ arrived: 2, pressedOut: 1, tickets: 2, cents: 4000, orders: 1 })
  })
})

describe('attribution per poster (the daily poster directive of 30 October 2026, step 9)', () => {
  it('counts its /go taps and the claims of its nights for 30 days from when it went, and nothing before it went', () => {
    const went = '2026-10-27T08:00:00.000Z'
    const poster = piece('c2', { kind: 'daily_poster', postedAt: went, nightIds: ['ev-1'] })
    const waiting = piece('c2', { kind: 'daily_poster', nightIds: ['ev-2'] })
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C2],
      pieces: [poster, waiting],
      figures: [],
      linkEvents: [],
      orders: new Map(),
      counted: new Map(),
      now: NOW,
      goPresses: [
        { pieceId: poster.id, pressedAt: '2026-10-27T09:00:00.000Z' },
        { pieceId: poster.id, pressedAt: '2026-10-28T09:00:00.000Z' },
        { pieceId: poster.id, pressedAt: '2026-10-26T09:00:00.000Z' }, // before it went
        { pieceId: poster.id, pressedAt: '2026-11-28T09:00:00.000Z' }, // past 30 days
        { pieceId: waiting.id, pressedAt: '2026-10-28T09:00:00.000Z' },
      ],
      claims: [
        { eventId: 'ev-1', createdAt: '2026-10-29T09:00:00.000Z' },
        { eventId: 'ev-1', createdAt: '2026-10-20T09:00:00.000Z' }, // before it went
        { eventId: 'ev-9', createdAt: '2026-10-29T09:00:00.000Z' }, // another night
      ],
    })
    expect(r.pieces[0].goTaps).toBe(2)
    expect(r.pieces[0].claimsAfter).toBe(1)
    expect(r.pieces[0].claimsWords).toMatch(/after it went, not proof it caused them/)
    // A piece that has not gone is not counted, never 0.
    expect(r.pieces[1].goTaps).toBeNull()
    expect(r.pieces[1].claimsAfter).toBeNull()
  })

  it('reads every existing report the same when the poster inputs are absent', () => {
    const p = piece('c2', { postedAt: '2026-10-27T08:00:00.000Z' })
    const r = buildSocialReport({ campaignId: 'c2', campaigns: [C2], pieces: [p], figures: [], linkEvents: [], orders: new Map(), counted: new Map(), now: NOW })
    expect(r.pieces[0].goTaps).toBe(0)
    expect(r.pieces[0].claimsAfter).toBe(0)
  })
})

describe('K14: entered and counted never mix', () => {
  it('changing every entered figure changes no counted figure', () => {
    const p = piece('c2', { postedAt: '2026-10-27T08:00:00.000Z', countedLinkId: 'L9' })
    const base = {
      campaignId: 'c2',
      campaigns: [C2],
      pieces: [p],
      linkEvents: [{ linkId: 'L9', kind: 'click' as const, orderId: null, occurredAt: '2026-10-28T00:00:00.000Z' }],
      orders: new Map(),
      counted: new Map([['c2', week({ visitors: 12, visitorsFromSocial: 3, externalBookingClicks: 5 })]]),
      now: NOW,
    }
    const a = buildSocialReport({ ...base, figures: [] })
    const b = buildSocialReport({ ...base, figures: [fig(p.id, 'instagram', 'reach', 9000), fig(p.id, 'facebook', 'shares', 40)] })
    expect(b.counted).toEqual(a.counted)
    expect(b.pieces[0].counted).toEqual(a.pieces[0].counted)
  })

  it('an enquiry count the database cannot give is not counted, never zero', () => {
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C2],
      pieces: [],
      figures: [],
      linkEvents: [],
      orders: new Map(),
      counted: new Map([['c2', week({ organiserEnquiries: null })]]),
      now: NOW,
    })
    expect(r.counted?.organiserEnquiries).toBeNull()
  })

  it('a press out to another site is never counted as an order on EventLinqs', () => {
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C2],
      pieces: [],
      figures: [],
      linkEvents: [],
      orders: new Map(),
      counted: new Map([['c2', week({ externalBookingClicks: 30 })]]),
      now: NOW,
    })
    expect(r.counted?.externalBookingClicks).toBe(30)
    expect(r.counted?.nativeOrders).toBe(0)
  })
})

describe('J17: earlier campaigns and the baseline', () => {
  it('compares with the earlier campaigns that went, newest first, and never a later one', () => {
    const before = piece('c1', { postedAt: '2026-10-20T08:00:00.000Z' })
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C1, C2, C3],
      pieces: [before, piece('c2', { postedAt: '2026-10-27T08:00:00.000Z' }), piece('c3', { postedAt: '2026-11-03T08:00:00.000Z' })],
      figures: [],
      linkEvents: [],
      orders: new Map(),
      counted: new Map([
        ['c1', week({ visitors: 10 })],
        ['c2', week({ visitors: 15 })],
        ['c3', week({ visitors: 99 })],
      ]),
      now: NOW,
    })
    expect(r.previous.map((p) => p.weekStart)).toEqual(['2026-10-19'])
    expect(r.previous[0].counted?.visitors).toBe(10)
    expect(r.baseline).toEqual({ campaigns: 1, from: '2026-10-19', to: '2026-10-19' })
    expect(r.baselineWords).toBe('Compared with 1 earlier campaign that went, the week of 2026-10-19.')
  })

  it('an earlier campaign that never went is not a baseline', () => {
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C1, C2],
      pieces: [piece('c1'), piece('c2', { postedAt: '2026-10-27T08:00:00.000Z' })],
      figures: [],
      linkEvents: [],
      orders: new Map(),
      counted: new Map(),
      now: NOW,
    })
    expect(r.baseline).toBeNull()
    expect(r.recommendations).toEqual([])
  })
})

describe('G3, G4, G5: at most three recommendations, each with its data, waiting for a person', () => {
  /** Two weeks that went, with reach entered for two kinds on both platforms, and two cities. */
  function measured() {
    const pieces: PieceRow[] = []
    const figures: FigureRow[] = []
    for (const c of [C1, C2]) {
      const posted = c.id === 'c1' ? '2026-10-20T08:00:00.000Z' : '2026-10-27T08:00:00.000Z'
      for (const [kind, city, ig, fb] of [
        ['discovery_reel', 'melbourne', 4000, 900],
        ['discovery_reel', 'geelong', 3600, 800],
        ['week_ahead', 'melbourne', 1200, 300],
        ['week_ahead', 'geelong', 1000, 200],
      ] as const) {
        const p = piece(c.id, { kind, city, postedAt: posted })
        pieces.push(p)
        figures.push(fig(p.id, 'instagram', 'reach', ig, posted.replace('08:00', '20:00')), fig(p.id, 'facebook', 'reach', fb, posted.replace('08:00', '20:00')))
      }
    }
    return { pieces, figures }
  }

  it('never more than three, each carrying the figures it rests on, and every one pending', () => {
    const { pieces, figures } = measured()
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C1, C2],
      pieces,
      figures,
      linkEvents: [],
      orders: new Map(),
      counted: new Map([
        ['c1', week({ liveByCity: { melbourne: 40, geelong: 4 }, socialVisitorsByCity: { melbourne: 30, geelong: 2 } })],
        ['c2', week({ liveByCity: { melbourne: 42, geelong: 5 }, socialVisitorsByCity: { melbourne: 35, geelong: 1 } })],
      ]),
      now: NOW,
    })
    expect(r.recommendations.length).toBeGreaterThan(0)
    expect(r.recommendations.length).toBeLessThanOrEqual(MAX_RECOMMENDATIONS)
    expect(MAX_RECOMMENDATIONS).toBe(3)
    for (const rec of r.recommendations) {
      expect(rec.rule).toMatch(/^[a-z][a-z_]{2,59}$/)
      expect(Object.keys(rec.evidence).length).toBeGreaterThan(0)
      expect(rec.words).not.toMatch(/[–—!]/)
      expect(rec.words.length).toBeGreaterThanOrEqual(10)
      expect(rec.words.length).toBeLessThanOrEqual(600)
    }
    const rules = r.recommendations.map((x) => x.rule)
    // The Reel's median reach is three times the week ahead's on Instagram, over four pieces each.
    expect(rules).toContain('more_of_the_strongest_kind')
    const kind = r.recommendations.find((x) => x.rule === 'more_of_the_strongest_kind')
    expect(kind?.evidence).toMatchObject({ strongest: 'discovery_reel', weakest: 'week_ahead', strongestMedianReach: 3800, weakestMedianReach: 1100, piecesEach: 4, source: 'entered' })
    // Geelong had 5 nights live and 1 visitor from social: weak supply, said with the number.
    const city = r.recommendations.find((x) => x.rule === 'city_weak_supply')
    expect(city?.evidence).toMatchObject({ city: 'geelong', liveListings: 5 })
  })

  /** This week two cities, each two pieces with Instagram reach; a baseline week that went. */
  function cities(reach: { melbourne: number; geelong: number }, social: { melbourne: number; geelong: number }) {
    const pieces: PieceRow[] = [piece('c1', { postedAt: '2026-10-20T08:00:00.000Z' })]
    const figures: FigureRow[] = []
    for (const city of ['melbourne', 'geelong'] as const) {
      for (const kind of ['week_ahead', 'weekend_carousel']) {
        const p = piece('c2', { kind, city, postedAt: '2026-10-27T08:00:00.000Z' })
        pieces.push(p)
        figures.push(fig(p.id, 'instagram', 'reach', reach[city], '2026-10-28T00:00:00.000Z'))
      }
    }
    return buildSocialReport({
      campaignId: 'c2',
      campaigns: [C1, C2],
      pieces,
      figures,
      linkEvents: [],
      orders: new Map(),
      counted: new Map([['c2', week({ liveByCity: { melbourne: 30, geelong: 20 }, socialVisitorsByCity: social })]]),
      now: NOW,
    })
  }

  it('G5: a city seen by too few people is weak distribution, said with both medians', () => {
    const rec = cities({ melbourne: 3000, geelong: 500 }, { melbourne: 40, geelong: 2 }).recommendations.find((r) => r.rule.startsWith('city_'))
    expect(rec?.rule).toBe('city_weak_distribution')
    expect(rec?.evidence).toMatchObject({ city: 'geelong', medianReach: 500, campaignMedianReach: 1750 })
  })

  it('G5: a city seen as widely but not acted on is weak content, never by dividing visitors by reach (K14)', () => {
    const rec = cities({ melbourne: 3000, geelong: 3000 }, { melbourne: 40, geelong: 2 }).recommendations.find((r) => r.rule.startsWith('city_'))
    expect(rec?.rule).toBe('city_weak_content')
    expect(rec?.evidence).toMatchObject({ city: 'geelong', socialVisitors: 2, medianReach: 3000, campaignMedianReach: 3000, campaignMedianVisitorsAPiece: 11 })
    expect(Object.keys(rec?.evidence ?? {}).some((k) => /per1000|PerReach/i.test(k))).toBe(false)
  })

  it('without enough pieces of each kind the kind rule stays silent rather than guess', () => {
    const p1 = piece('c1', { kind: 'discovery_reel', postedAt: '2026-10-20T08:00:00.000Z' })
    const p2 = piece('c2', { kind: 'week_ahead', postedAt: '2026-10-27T08:00:00.000Z' })
    const r = buildSocialReport({
      campaignId: 'c2',
      campaigns: [C1, C2],
      pieces: [p1, p2],
      figures: [fig(p1.id, 'instagram', 'reach', 5000, '2026-10-21T00:00:00.000Z'), fig(p2.id, 'instagram', 'reach', 100, '2026-10-28T00:00:00.000Z')],
      linkEvents: [],
      orders: new Map(),
      counted: new Map(),
      now: NOW,
    })
    expect(r.recommendations.map((x) => x.rule)).not.toContain('more_of_the_strongest_kind')
  })
})

describe('a campaign week on the platform clock', () => {
  it('runs Monday 00:00 to the next Monday 00:00 in Melbourne, across a month end', () => {
    expect(weekOf('2026-10-26', 'Australia/Melbourne')).toEqual({ from: '2026-10-25T13:00:00.000Z', to: '2026-11-01T13:00:00.000Z', monday: '2026-10-26' })
  })
})

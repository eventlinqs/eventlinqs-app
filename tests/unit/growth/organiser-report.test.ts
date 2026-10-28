import { describe, expect, it } from 'vitest'
import {
  addedLines,
  nightFigures,
  nightsDue,
  REPORT_AFTER_HOURS,
  REPORT_LOOKBACK_DAYS,
  type EndedNight,
  type NightRows,
} from '@/lib/growth/organiser-report-math'

/**
 * The organiser's report after each night, kept (the engine plan of 28 October 2026, part H). Item 20's after-event
 * figures are kept as they are; this adds the presses out per site (never a sale, K14), our own orders where we sell
 * the night, and the posts that named it.
 */

const NOW = new Date('2026-11-02T00:00:00Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

function night(id: string, endedAgo: number, over: Partial<EndedNight> = {}): EndedNight {
  return { id, organisationId: 'org1', endDate: ago(endedAgo), isPublic: true, isSeed: false, ...over }
}

describe('nightsDue', () => {
  it('reports a public night once it has been over long enough', () => {
    const due = nightsDue([night('a', REPORT_AFTER_HOURS * HOUR), night('b', REPORT_AFTER_HOURS * HOUR - 1)], new Set(), NOW)
    expect(due.map((d) => d.id)).toEqual(['a'])
  })

  it('never reports a night twice, a hidden or seeded night, one long gone or one still ahead', () => {
    const due = nightsDue(
      [
        night('done', DAY),
        night('hidden', DAY, { isPublic: false }),
        night('seed', DAY, { isSeed: true }),
        night('old', (REPORT_LOOKBACK_DAYS + 1) * DAY),
        night('ahead', -DAY),
      ],
      new Set(['done']),
      NOW,
    )
    expect(due).toEqual([])
  })
})

const ROWS: NightRows = {
  numbers: { views: 140, reminders: 6, calendarAdds: 2, shares: 3, follows: 1, actionsPerView: 12 / 140 },
  reach: { totals: { views: 20, clicks: 15 }, byChannel: [{ channel: 'instagram', views: 20, clicks: 15 }] },
  presses: [
    { visitor: 'v1', rowId: 'r1', provider: 'humanitix' },
    { visitor: 'v1', rowId: 'r2', provider: 'humanitix' },
    { visitor: 'v2', rowId: 'r3', provider: 'eventbrite' },
    { visitor: null, rowId: 'r4', provider: 'humanitix' },
  ],
  orders: null,
  posts: [{ pieceId: 'p1', platform: 'instagram', postUrl: 'https://www.instagram.com/p/x/', postedAt: ago(5 * DAY), nightsNamed: 5, goPresses: 7 }],
}

describe('nightFigures', () => {
  it('keeps item 20 figures exactly as read', () => {
    const f = nightFigures(ROWS)
    expect(f.numbers).toEqual(ROWS.numbers)
    expect(f.reach).toEqual(ROWS.reach)
  })

  it('counts presses out by person per site, a press with no visitor key as its own person', () => {
    expect(nightFigures(ROWS).pressesOut).toEqual({ people: 3, bySite: [{ provider: 'humanitix', people: 2 }, { provider: 'eventbrite', people: 1 }] })
  })

  it('counts orders on EventLinqs only where EventLinqs sells the night, and only those that stand', () => {
    expect(nightFigures(ROWS).onEventLinqs).toBeNull()
    const sold = nightFigures({ ...ROWS, orders: [{ status: 'confirmed', tickets: 2 }, { status: 'refunded', tickets: 4 }, { status: 'partially_refunded', tickets: 1 }] })
    expect(sold.onEventLinqs).toEqual({ orders: 2, tickets: 3 })
  })
})

describe('addedLines', () => {
  const words = {
    siteName: (p: string) => ({ humanitix: 'Humanitix', eventbrite: 'Eventbrite' } as Record<string, string>)[p] ?? 'their booking page',
    dateOf: () => 'Thu 29 Oct',
  }

  it('never calls a press out a sale, and says what is not visible to us', () => {
    const text = addedLines(nightFigures(ROWS), words).join('\n')
    expect(text).toContain('EventLinqs sent 3 people on to your booking page: 2 to Humanitix, 1 to Eventbrite.')
    expect(text).toContain('not a ticket sold')
    expect(text).not.toMatch(/\b(sale|sales|revenue)\b/i)
  })

  it('says a shared post is counted for the post as a whole', () => {
    const text = addedLines(nightFigures(ROWS), words).join('\n')
    expect(text).toContain('Our Instagram post of Thu 29 Oct named your night: 7 people tapped it from our profile link (the post named 5 nights')
  })

  it('says nobody pressed on when nobody did, and leaves out EventLinqs orders for a night we do not sell', () => {
    const lines = addedLines(nightFigures({ ...ROWS, presses: [], posts: [] }), words)
    expect(lines).toEqual(['Nobody pressed on from your listing to your booking page.'])
  })

  it('carries no long dash and no exclamation mark', () => {
    for (const l of addedLines(nightFigures(ROWS), words)) expect(l).not.toMatch(/[–—!]/)
  })
})

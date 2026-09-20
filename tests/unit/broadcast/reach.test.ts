/**
 * THE REACH PANEL COUNTS EVERY TRACKED EVENT, OR SAYS IT COULD NOT.
 *
 * WHY THIS FILE EXISTS AT ALL. `fetchReachSummary` had NO unit test. It is the
 * one screen on which this platform proves its own wedge to an organiser, that
 * we brought them demand, and every number on it came from four unbounded
 * `.select()` calls whose `error` was discarded:
 *
 *     const { data: events } = await admin.from('share_link_events').select(...)
 *     const rows = (events ?? []) as ...
 *
 * `share_link_events` takes one row per VIEW and one per CLICK, so it is the
 * fastest growing table behind the panel, and `share_links` grows one row per
 * ATTENDEE SHARE. Supabase caps a response at 1,000 rows in silence: HTTP 200,
 * `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 *
 * The direction is what makes it serious. Every number gets SMALLER, and the
 * `conversion` rows dropped are attributed SALES, so the panel tells an
 * organiser their own sharing sold fewer tickets than it did. A discarded error
 * rendered the same screen as an event nobody had ever shared.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type LinkRow = { id: string; channel: string }
type EventRow = { link_id: string; kind: string; order_id: string | null }
type OrderRow = { id: string; status: string }
type TicketRow = { order_id: string }

const data = {
  share_links: [] as LinkRow[],
  share_link_events: [] as EventRow[],
  orders: [] as OrderRow[],
  tickets: [] as TicketRow[],
}

/** Supabase's real per-RESPONSE cap. A paged reader walks past it. */
const perResponseCeiling: Partial<Record<keyof typeof data, number>> = {}
/** A read that FAILS. Proves the error is no longer dropped on the floor. */
const failOn: Partial<Record<keyof typeof data, string>> = {}
/** Every window the stub was asked for, so paging can be asserted, not assumed. */
const windowsAsked: Record<string, [number, number][]> = {}

function stubAdmin() {
  return {
    from(table: keyof typeof data) {
      const preds: ((r: Record<string, unknown>) => boolean)[] = []
      let lo = 0
      let hi = Number.MAX_SAFE_INTEGER
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.eq = (col: string, val: unknown) => {
        preds.push(r => !(col in r) || r[col] === val)
        return builder
      }
      builder.in = (col: string, vals: unknown[]) => {
        preds.push(r => !(col in r) || vals.includes(r[col]))
        return builder
      }
      builder.order = () => builder
      builder.range = (from: number, to: number) => {
        lo = from
        hi = to
        ;(windowsAsked[table] ??= []).push([from, to])
        return builder
      }
      builder.then = (resolve: (v: Record<string, unknown>) => unknown) => {
        const failure = failOn[table]
        if (failure) {
          return Promise.resolve({ data: null, error: { message: failure } }).then(resolve)
        }
        const all = (data[table] as unknown as Record<string, unknown>[]).filter(r =>
          preds.every(p => p(r)),
        )
        const window = all.slice(lo, hi + 1)
        const cap = perResponseCeiling[table]
        return Promise.resolve({
          data: typeof cap === 'number' ? window.slice(0, cap) : window,
          error: null,
        }).then(resolve)
      }
      return builder
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => stubAdmin() }))

const { fetchReachSummary } = await import('@/lib/broadcast/reach')

const EVENT = 'event-1'

beforeEach(() => {
  data.share_links = []
  data.share_link_events = []
  data.orders = []
  data.tickets = []
  for (const knob of [perResponseCeiling, failOn]) {
    for (const k of Object.keys(knob)) delete knob[k as keyof typeof data]
  }
  for (const k of Object.keys(windowsAsked)) delete windowsAsked[k]
})

describe('it counts what actually happened on the tracked links', () => {
  it('splits views, clicks and conversions by the channel of the link', async () => {
    data.share_links = [
      { id: 'l-wa', channel: 'whatsapp' },
      { id: 'l-ig', channel: 'instagram' },
    ]
    data.share_link_events = [
      { link_id: 'l-wa', kind: 'view', order_id: null },
      { link_id: 'l-wa', kind: 'click', order_id: null },
      { link_id: 'l-wa', kind: 'conversion', order_id: 'o1' },
      { link_id: 'l-ig', kind: 'view', order_id: null },
    ]
    data.orders = [{ id: 'o1', status: 'confirmed' }]
    data.tickets = [{ order_id: 'o1' }, { order_id: 'o1' }]

    const r = await fetchReachSummary(EVENT)

    expect(r.linkCount).toBe(2)
    expect(r.totals).toEqual({ views: 2, clicks: 1, conversions: 1, tickets: 2 })
    const wa = r.byChannel.find(c => c.channel === 'whatsapp')
    expect(wa).toMatchObject({ views: 1, clicks: 1, conversions: 1, tickets: 2 })
  })

  it('returns an empty summary when the event has no tracked links', async () => {
    const r = await fetchReachSummary(EVENT)
    expect(r).toEqual({
      totals: { views: 0, clicks: 0, conversions: 0, tickets: 0 },
      byChannel: [],
      linkCount: 0,
    })
  })
})

/**
 * THE CEILING, AND THE PROOF THAT PAGING BEATS IT.
 *
 * Each case sets a per-response cap far below the row count. Before this item
 * every one of these reads asked once and took whatever came back, so each
 * assertion below is a number the panel used to get wrong.
 */
describe('every row is counted, past the 1,000-row response cap', () => {
  it('pages the tracked links rather than taking the first response', async () => {
    data.share_links = Array.from({ length: 7 }, (_, i) => ({
      id: `l${i}`,
      channel: 'whatsapp',
    }))
    perResponseCeiling.share_links = 2

    const r = await fetchReachSummary(EVENT)

    expect(r.linkCount, 'seven links, read two at a time').toBe(7)
    expect(
      windowsAsked.share_links.length,
      'it kept asking until a page came back empty',
    ).toBeGreaterThan(1)
  })

  it('pages the view and click events, so the reach number is the whole number', async () => {
    data.share_links = [{ id: 'l-wa', channel: 'whatsapp' }]
    data.share_link_events = Array.from({ length: 9 }, () => ({
      link_id: 'l-wa',
      kind: 'click',
      order_id: null,
    }))
    perResponseCeiling.share_link_events = 4

    const r = await fetchReachSummary(EVENT)

    expect(r.totals.clicks).toBe(9)
  })

  it('pages the tickets on the attributed orders', async () => {
    data.share_links = [{ id: 'l-wa', channel: 'whatsapp' }]
    data.share_link_events = [{ link_id: 'l-wa', kind: 'conversion', order_id: 'o1' }]
    data.orders = [{ id: 'o1', status: 'confirmed' }]
    data.tickets = Array.from({ length: 6 }, () => ({ order_id: 'o1' }))
    perResponseCeiling.tickets = 2

    const r = await fetchReachSummary(EVENT)

    expect(r.totals.tickets).toBe(6)
  })
})

/**
 * A FAILED READ IS NOT AN EVENT NOBODY SHARED.
 *
 * Every read here used to drop `error` and coalesce to `[]`, so an unreachable
 * database rendered "0 views, 0 clicks, 0 tickets" under a heading that says
 * those are measured facts. On this panel that reads as proof the platform
 * delivered nothing, which is the opposite of what is known.
 */
describe('a failed read throws rather than reporting a reach of zero', () => {
  it('throws when the tracked links cannot be read', async () => {
    failOn.share_links = 'connection terminated'
    await expect(fetchReachSummary(EVENT)).rejects.toThrow(/tracked links/i)
  })

  it('throws when the link events cannot be read', async () => {
    data.share_links = [{ id: 'l-wa', channel: 'whatsapp' }]
    failOn.share_link_events = 'connection terminated'
    await expect(fetchReachSummary(EVENT)).rejects.toThrow(/view, click and conversion/i)
  })
})

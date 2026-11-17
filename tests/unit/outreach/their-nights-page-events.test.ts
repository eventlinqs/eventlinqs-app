import { describe, expect, it } from 'vitest'
import { readTheirNights } from '@/lib/outreach/their-nights'

/*
 * A PRESENTER'S NIGHTS AT A SHARED VENUE ARE THEIRS BY THEIR OWN PAGE (the PM's 09:15 of 18 November 2026, item 3:
 * tomorrow's 20 from the listed events' organisers). Read on production at 09:18: 103 upcoming titles name a presenter
 * (Geelong Symphony Orchestra at Costa Hall, Bendigo Symphony Orchestra, Stage 29 Studios at Ulumbarra Theatre), whose
 * nights book at the venue's box office, so none of the reader's roads reached them: a venue link would claim every
 * other presenter's nights there. The fifth road: a night they publish on their own page (organiser_page_events, read
 * on their page and recorded with the day it was read) is theirs where a public listing matches it by its title, its
 * local day and its place. Never by the title alone, never another show at the same hall, and it writes nothing.
 */

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>
type Call = { readonly m: string; readonly a: readonly unknown[] }

const likeToRegex = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 'i')

function fakeDb(tables: Tables) {
  const calls: { table: string; m: string }[] = []
  const from = (table: string) => {
    const chain: Call[] = []
    const resolve = () => {
      let rows = [...(tables[table] ?? [])]
      for (const { m, a } of chain) {
        const [col, x, y] = a as [string, unknown, unknown]
        const has = (r: Row) => Object.prototype.hasOwnProperty.call(r, col)
        if (m === 'eq') rows = rows.filter((r) => !has(r) || r[col] === x)
        if (m === 'is') rows = rows.filter((r) => !has(r) || r[col] === x)
        if (m === 'not' && x === 'is' && y === null) rows = rows.filter((r) => r[col] !== null && r[col] !== undefined)
        if (m === 'in') rows = rows.filter((r) => (x as unknown[]).includes(r[col]))
        if (m === 'gt') rows = rows.filter((r) => String(r[col]) > String(x))
        if (m === 'gte') rows = rows.filter((r) => String(r[col]) >= String(x))
        if (m === 'lte') rows = rows.filter((r) => String(r[col]) <= String(x))
        if (m === 'ilike') rows = rows.filter((r) => typeof r[col] === 'string' && likeToRegex(String(x)).test(r[col] as string))
      }
      return { data: rows, error: null }
    }
    const builder: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'then') return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad)
          return (...a: unknown[]) => {
            chain.push({ m: String(prop), a })
            calls.push({ table, m: String(prop) })
            return builder
          }
        },
      },
    )
    return builder
  }
  return { db: { from } as unknown as Parameters<typeof readTheirNights>[0], calls }
}

const NOW = new Date('2026-11-18T00:00:00Z')
const night = (id: string, title: string, start: string, venue: string): Row => ({
  id,
  slug: id,
  title,
  start_date: start,
  end_date: new Date(Date.parse(start) + 3 * 3_600_000).toISOString(),
  timezone: 'Australia/Melbourne',
  venue_name: venue,
  is_free: false,
  status: 'published',
  visibility: 'public',
  organisation_id: 'g-listings',
  venue_id: 'v-costa',
  external_ticket_url: 'https://geelongartscentre.org.au/whats-on/all-events/brahms-violin/',
})
const tables = (): Tables => ({
  admin_users: [],
  organisations: [],
  organiser_venues: [],
  event_booking_links: [],
  organiser_page_events: [
    { organiser_id: 'org-gso', title: 'Brahms Violin', starts_on: '2027-02-20', ends_on: null, place: 'Costa Hall' },
    { organiser_id: 'org-gso', title: 'Italian Opera Gala', starts_on: '2027-05-22', ends_on: null, place: 'Costa Hall' },
    { organiser_id: 'org-other', title: 'Bare Bones', starts_on: '2027-02-20', ends_on: null, place: 'Costa Hall' },
  ],
  events: [
    // 7.30 pm on Saturday 20 February 2027 in Melbourne (AEDT, UTC+11).
    night('e-brahms', 'Geelong Symphony Orchestra: Brahms Violin', '2027-02-20T08:30:00Z', 'Costa Hall'),
    night('e-adams', 'Bryan Adams: Bare Bones', '2027-02-20T09:00:00Z', 'Costa Hall'),
    night('e-brahms-elsewhere', 'Geelong Symphony Orchestra: Brahms Violin', '2027-02-20T08:30:00Z', 'Hamer Hall'),
    night('e-brahms-next-week', 'Geelong Symphony Orchestra: Brahms Violin', '2027-02-27T08:30:00Z', 'Costa Hall'),
    night('e-gala', 'Geelong Symphony Orchestra: Italian Opera Gala', '2027-05-22T09:30:00Z', 'Costa Hall'),
  ],
})
const gso = { id: 'org-gso', organisation_id: null, website_url: 'https://gso.org.au' }

describe("a presenter's nights by its own page", () => {
  it('takes the listing that matches a night on their own page by title, local day and place', async () => {
    const { db } = fakeDb(tables())
    expect((await readTheirNights(db, gso, NOW, 12)).map((n) => n.eventId)).toEqual(['e-brahms', 'e-gala'])
  })
  it('never another show at the same hall that day, the same show at another place, or the same show another day', async () => {
    const { db } = fakeDb(tables())
    const ids = (await readTheirNights(db, gso, NOW, 12)).map((n) => n.eventId)
    expect(ids).not.toContain('e-adams')
    expect(ids).not.toContain('e-brahms-elsewhere')
    expect(ids).not.toContain('e-brahms-next-week')
  })
  it('reads only their own page events, and writes nothing', async () => {
    const { db, calls } = fakeDb(tables())
    const ids = (await readTheirNights(db, { id: 'org-none', organisation_id: null, website_url: null }, NOW, 12)).map((n) => n.eventId)
    expect(ids).toEqual([])
    expect(calls.filter((c) => /^(insert|update|upsert|delete|rpc)$/.test(c.m))).toEqual([])
  })
})

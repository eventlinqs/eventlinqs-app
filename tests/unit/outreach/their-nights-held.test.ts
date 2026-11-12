import { describe, expect, it } from 'vitest'
import { readTheirNights } from '@/lib/outreach/their-nights'

/*
 * A NIGHT THE FOUNDER LISTED FOR THEM IS THEIRS (WINDOW 5A, 12 November 2026, 21:18). AMCF's contact (the festival at
 * Fed Square) opened his photo page and read "No nights of yours are listed ahead right now" while the festival of
 * 20 November was published: Lawal listed it in an organisation his own account owns, named for them with their own
 * website, and the reader had no road from the organiser to it. These cases hold the road open, and hold it narrow: only
 * the founder's organisations, only by the organiser's own website host, never a website-less one (EventLinqs listings),
 * never a stranger's or a disabled account's, and it writes nothing.
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

const NOW = new Date('2026-11-12T10:00:00Z')
const night = (id: string, organisation_id: string): Row => ({
  id,
  slug: id,
  title: `Night ${id}`,
  start_date: '2026-11-20T00:00:00Z',
  end_date: '2026-11-22T09:00:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: 'Fed Square',
  is_free: true,
  status: 'published',
  visibility: 'public',
  organisation_id,
  venue_id: null,
  external_ticket_url: null,
})
const base = (): Tables => ({
  admin_users: [
    { id: 'founder-1', role: 'super_admin', disabled_at: null },
    { id: 'old-founder', role: 'super_admin', disabled_at: '2026-01-01T00:00:00Z' },
  ],
  organisations: [
    { id: 'g-amcf', owner_id: 'founder-1', website: 'https://amcf.org.au' },
    { id: 'g-listings', owner_id: 'founder-1', website: null },
    { id: 'g-stranger', owner_id: 'someone-else', website: 'https://amcf.org.au' },
    { id: 'g-disabled', owner_id: 'old-founder', website: 'https://amcf.org.au' },
  ],
  organiser_venues: [],
  event_booking_links: [],
  events: [night('ev-amcf', 'g-amcf'), night('ev-listings', 'g-listings'), night('ev-stranger', 'g-stranger'), night('ev-disabled', 'g-disabled')],
})
const amcf = { id: 'org-amcf', organisation_id: null, website_url: 'https://amcf.org.au' }

describe('a night the founder listed for them', () => {
  it('is theirs when the founder holds an organisation with their own website (the AMCF case)', async () => {
    const { db } = fakeDb(base())
    const nights = await readTheirNights(db, amcf, NOW, 12)
    expect(nights.map((n) => n.eventId)).toEqual(['ev-amcf'])
    expect(nights[0]).toMatchObject({ slug: 'ev-amcf', venueName: 'Fed Square' })
  })

  it("never takes the founder's website-less listings, a stranger's organisation or a disabled account's", async () => {
    const { db } = fakeDb(base())
    const ids = (await readTheirNights(db, amcf, NOW, 12)).map((n) => n.eventId)
    expect(ids).not.toContain('ev-listings')
    expect(ids).not.toContain('ev-stranger')
    expect(ids).not.toContain('ev-disabled')
  })

  it('matches a held website written without its scheme or with www, and never on a different host', async () => {
    const t = base()
    t.organisations = [
      { id: 'g-amcf', owner_id: 'founder-1', website: 'www.amcf.org.au/' },
      { id: 'g-other', owner_id: 'founder-1', website: 'https://amcf.org' },
    ]
    t.events = [night('ev-amcf', 'g-amcf'), night('ev-other', 'g-other')]
    const { db } = fakeDb(t)
    expect((await readTheirNights(db, amcf, NOW, 12)).map((n) => n.eventId)).toEqual(['ev-amcf'])
  })

  it('reads nothing held for an organiser whose website is a shared host or missing', async () => {
    const t = base()
    t.organisations.push({ id: 'g-fb', owner_id: 'founder-1', website: 'https://www.facebook.com/amcf' })
    t.events.push(night('ev-fb', 'g-fb'))
    for (const website_url of ['https://www.facebook.com/amcf', null]) {
      const { db, calls } = fakeDb(t)
      expect(await readTheirNights(db, { id: 'org-x', organisation_id: null, website_url }, NOW, 12)).toEqual([])
      expect(calls.some((c) => c.table === 'organisations')).toBe(false)
    }
  })

  it('keeps an organisation they already own once, and writes nothing', async () => {
    const { db, calls } = fakeDb(base())
    const nights = await readTheirNights(db, { ...amcf, organisation_id: 'g-amcf' }, NOW, 12)
    expect(nights.map((n) => n.eventId)).toEqual(['ev-amcf'])
    expect(calls.filter((c) => /^(insert|update|upsert|delete|rpc)$/.test(c.m))).toEqual([])
  })
})

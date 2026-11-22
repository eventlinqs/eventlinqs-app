import { describe, expect, it } from 'vitest'
import { addressesOn, basisFinds, roleRefusal } from '@/lib/outreach/basis-find'
import { poolOrder, runBasisPool, type PoolStore } from '@/lib/outreach/basis-pool'
import { poolFoundGlance } from '@/lib/admin/today-math'
import type { Fetcher } from '@/lib/listings/collect-run'

/*
 * THE TWENTY'S POOL GROWS BY ITSELF (Lawal's 10:42 of 13 November 2026). The basis tool's own reading, ported: an address
 * on the organiser's own page, at its own domain, in its events role, on a page with no statement against messages; the
 * no-messages check itself left to Lawal at send. Built by hand in the shape of an organiser's site.
 */

const SITE = 'https://www.bp-proof-nights.com.au'
const org = { name: 'Bp Proof Nights', website: `${SITE}/` }

describe('the basis reading, pure', () => {
  it('takes addresses written out and as mailto links, never an image name', () => {
    expect(addressesOn('<a href="mailto:Hello@bp-proof-nights.com.au">x</a> book: events@bp-proof-nights.com.au logo@2x.png').sort()).toEqual(
      ['events@bp-proof-nights.com.au', 'hello@bp-proof-nights.com.au'],
    )
  })

  it('takes its own domain and a free mail address its own page publishes, never another organisation\'s, never one it holds', () => {
    // Lawal's outreach engine rebuild of 22 November 2026, section 1: the business domain match is removed; the night before,
    // 8 of 12 reads found 'no address at its own domain on its own pages'.
    const pages = [{ url: `${SITE}/contact`, html: '<p>Bookings: events@bp-proof-nights.com.au or bpproofnights@gmail.com, tickets via agent@other-agency.com.au</p>' }]
    const got = basisFinds(org, pages, [])
    expect(got.finds.map((f) => [f.address, f.kind])).toEqual([
      ['events@bp-proof-nights.com.au', 'own domain'],
      ['bpproofnights@gmail.com', 'free mail'],
    ])
    expect(got.finds[1].quote).toContain('bpproofnights@gmail.com')
    expect(got.finds[1].quote).toContain('Bookings:')
    expect(got.refused).toEqual([{ address: 'agent@other-agency.com.au', pageUrl: `${SITE}/contact`, why: "another organisation's domain (other-agency.com.au), not theirs" }])
    expect(basisFinds(org, pages, ['events@bp-proof-nights.com.au', 'bpproofnights@gmail.com']).finds).toEqual([])
  })

  it('a free mail address still passes the role rule and the statement rule', () => {
    expect(basisFinds(org, [{ url: `${SITE}/careers`, html: '<p>Apply: jobs@gmail.com</p>' }], []).refused[0].why).toMatch(/not their role/)
    expect(basisFinds(org, [{ url: `${SITE}/contact`, html: '<p>bpproofnights@gmail.com. No unsolicited marketing please.</p>' }], []).finds).toEqual([])
  })

  it('refuses a page with a statement against messages, saying so', () => {
    const pages = [{ url: `${SITE}/contact`, html: '<p>events@bp-proof-nights.com.au. No unsolicited marketing please.</p>' }]
    const r = basisFinds(org, pages, [])
    expect(r.finds).toEqual([])
    expect(r.refused[0].why).toMatch(/^a statement against messages/)
  })

  it('refuses an inbox that is not their events role', () => {
    expect(roleRefusal('careers@bp-proof-nights.com.au', org.name)).toMatch(/careers inbox/)
    expect(roleRefusal('hello@bp-proof-nights.com.au', org.name, 'Send your resume and cover letter to')).toBe('published for job applications')
    expect(roleRefusal('library@geelong.vic.gov.au', 'Bp Proof Nights')).toMatch(/shared government domain/)
    expect(roleRefusal('hello@bp-proof-nights.com.au', org.name)).toBeNull()
  })
})

describe('the pool in a night', () => {
  const pages: Record<string, { status: number; body?: string }> = {
    [`${SITE}/robots.txt`]: { status: 200, body: 'User-agent: *\nAllow: /' },
    [`${SITE}/`]: { status: 200, body: '<footer><a href="mailto:events@bp-proof-nights.com.au">Email us</a></footer>' },
  }
  const fetcher: Fetcher = async (url) => {
    const p = pages[url]
    return p ? { status: p.status, text: async () => p.body ?? '' } : { status: 404, text: async () => '' }
  }
  const memory = () => {
    const recorded: { address: string; pageUrl: string; day: string }[] = []
    const store: PoolStore = {
      candidates: async () => [{ id: 'o1', name: org.name, website: org.website, known: [] }],
      record: async (r) => {
        recorded.push({ address: r.address, pageUrl: r.pageUrl, day: r.day })
        return true
      },
    }
    return { store, recorded }
  }

  it('records the address its own page publishes, with the page and the Melbourne day', async () => {
    const m = memory()
    const out = await runBasisPool(m.store, fetcher, new Date('2026-11-13T12:30:00Z'), Infinity, { pauseMs: 0 })
    expect(m.recorded).toEqual([{ address: 'events@bp-proof-nights.com.au', pageUrl: `${SITE}/`, day: '2026-11-13' }])
    expect(out[0]).toMatchObject({ organiser: org.name, recorded: 1 })
  })

  it('reads nothing robots.txt bars, and stops at a 403', async () => {
    const barred: Fetcher = async (url) => (url.endsWith('/robots.txt') ? { status: 200, text: async () => 'User-agent: *\nDisallow: /' } : { status: 200, text: async () => pages[`${SITE}/`].body ?? '' })
    const a = memory()
    await runBasisPool(a.store, barred, new Date('2026-11-13T12:30:00Z'), Infinity, { pauseMs: 0 })
    expect(a.recorded).toEqual([])
    const refusing: Fetcher = async (url) => (url.endsWith('/robots.txt') ? { status: 200, text: async () => '' } : { status: 403, text: async () => '' })
    const b = memory()
    const out = await runBasisPool(b.store, refusing, new Date('2026-11-13T12:30:00Z'), Infinity, { pauseMs: 0 })
    expect(out[0].outcome).toBe('the site answered 403: never read')
  })
})

describe("the Command Centre's pool line", () => {
  it('says how many were recorded and that nothing is sent before his own check', () => {
    const [item] = poolFoundGlance([{ address: 'events@bp-proof-nights.com.au', organiser: null, recorded_at: '2026-11-13T12:31:00Z' }], 1)
    expect(item.what).toBe('1 published address recorded for the twenty since yesterday')
    expect(item.why).toContain('Nothing is sent to one until you open its page and tick it when you send.')
    expect(poolFoundGlance([], 0)).toEqual([])
  })
})

// The PM's 00:59 of 21 November 2026, item 3 (law 38): the four guide cities' organisers are read first, each group in
// the daily rotation, so a night's reads are spent where the daily ten come from and every candidate is still tried.
describe('the four guide cities first', () => {
  const c = (id: string, inGuideCity?: boolean) => ({ id, name: id, website: `https://${id}.example.com.au`, known: [], inGuideCity })
  it('every guide city organiser comes before every other, whatever the day', () => {
    const all = [c('far-1'), c('geelong-1', true), c('far-2', false), c('bendigo-1', true), c('far-3'), c('melbourne-1', true)]
    for (const day of ['2026-11-21', '2026-11-22', '2026-12-01']) {
      const order = poolOrder(all, day)
      expect(order.slice(0, 3).every((o) => o.inGuideCity === true)).toBe(true)
      expect(order.map((o) => o.id).sort()).toEqual(all.map((o) => o.id).sort())
    }
  })
  it('within the guide cities the order still rotates by day, so each is tried in turn', () => {
    const guide = Array.from({ length: 8 }, (_, i) => c(`g${i}`, true))
    const first = new Set(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'].map((d) => poolOrder(guide, d)[0].id))
    expect(first.size).toBeGreaterThan(1)
  })
})

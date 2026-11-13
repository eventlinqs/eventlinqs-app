import { describe, expect, it } from 'vitest'
import { addressesOn, basisFinds, roleRefusal } from '@/lib/outreach/basis-find'
import { runBasisPool, type PoolStore } from '@/lib/outreach/basis-pool'
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

  it('takes only its own domain, never an address it already holds', () => {
    const pages = [{ url: `${SITE}/contact`, html: '<p>Bookings: events@bp-proof-nights.com.au or agent@other-agency.com.au</p>' }]
    expect(basisFinds(org, pages, []).finds).toEqual([{ address: 'events@bp-proof-nights.com.au', pageUrl: `${SITE}/contact` }])
    expect(basisFinds(org, pages, ['events@bp-proof-nights.com.au']).finds).toEqual([])
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

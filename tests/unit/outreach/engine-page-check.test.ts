import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { engineCheck, runBasisPool, type PoolStore } from '@/lib/outreach/basis-pool'
import { stopPageCheck } from '@/lib/outreach/page-checks'
import type { Fetcher } from '@/lib/listings/collect-run'

/*
 * LAW 43, THE ENGINE CHECKS THE PAGE (Lawal, 21 November 2026, 01:05: "the engine checks. The engine reads each
 * organizer's page and saves a copy as evidence. You see each one in the morning report and can stop any"). The pool
 * hands the store the page it read; the engine saves that page with its sha256 and only then ticks the contact, where the
 * organiser runs events in a guide city; any doubt leaves that one address unticked. A person's stop is kept, unticks the
 * contact and puts its waiting letters back to held.
 */
type Call = { table: string; op: string; payload: unknown; filters: [string, unknown][] }
const fakeDb = (opts: { contact?: { id: string } | null; saveError?: string; tickError?: string; check?: Record<string, unknown> | null } = {}) => {
  const calls: Call[] = []
  const from = (table: string) => {
    const call: Call = { table, op: 'select', payload: null, filters: [] }
    const answer = () => {
      if (table === 'organiser_contacts' && call.op === 'select') return { data: opts.contact === undefined ? { id: 'c1' } : opts.contact, error: null }
      if (table === 'organiser_page_checks' && call.op === 'insert') return { data: null, error: opts.saveError ? { message: opts.saveError } : null }
      if (table === 'organiser_page_checks' && call.op === 'select') return { data: opts.check ?? null, error: null }
      if (table === 'organiser_contacts' && call.op === 'update') return { data: null, error: opts.tickError ? { message: opts.tickError } : null }
      if (table === 'outreach_touches' && call.op === 'update') return { data: [{ id: 't1' }, { id: 't2' }], error: null }
      return { data: null, error: null }
    }
    const done = () => (calls.push(call), Promise.resolve(answer()))
    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => (call.filters.push([`eq:${k}`, v]), b),
      is: (k: string, v: unknown) => (call.filters.push([`is:${k}`, v]), b),
      insert: (p: unknown) => ((call.op = 'insert'), (call.payload = p), b),
      update: (p: unknown) => ((call.op = 'update'), (call.payload = p), b),
      maybeSingle: done,
      single: done,
      then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => done().then(ok, no),
    }
    return b
  }
  return { db: { from } as never, calls }
}
const PAGE = '<footer>Email events@bp-proof-nights.com.au for bookings</footer>'
const R = { organiserId: 'o1', address: 'events@bp-proof-nights.com.au', pageUrl: 'https://bp-proof-nights.com.au/', pageHtml: PAGE, inGuideCity: true, kind: 'own domain' as const, quote: 'Email events@bp-proof-nights.com.au for bookings' }

describe('the engine check', () => {
  it("a free mail address its own site publishes is checked the same, its kind and its words on the record (Lawal's 10:31, section 1)", async () => {
    const { db, calls } = fakeDb()
    const free = { ...R, address: 'bpproofnights@gmail.com', kind: 'free mail' as const, quote: 'Bookings: bpproofnights@gmail.com' }
    expect(await engineCheck(db, free)).toBe('checked')
    const verdict = (calls.find((c) => c.table === 'organiser_page_checks' && c.op === 'insert')?.payload as { verdict: Record<string, unknown> }).verdict
    expect(verdict).toMatchObject({ address_on_own_site: true, address_kind: 'free mail', quote: 'Bookings: bpproofnights@gmail.com' })
  })

  it('saves the page as read with its sha256, the three verdicts, by the engine, and only then ticks the contact', async () => {
    const { db, calls } = fakeDb()
    expect(await engineCheck(db, R)).toBe('checked')
    const save = calls.find((c) => c.table === 'organiser_page_checks' && c.op === 'insert')
    expect(save?.payload).toEqual({
      contact_id: 'c1',
      page_url: R.pageUrl,
      page_html: PAGE,
      page_sha256: createHash('sha256').update(PAGE, 'utf8').digest('hex'),
      checked_by: 'engine',
      verdict: {
        address_on_own_site: true,
        no_statement_against_messages: true,
        runs_events_in_its_city: true,
        address_kind: 'own domain',
        quote: 'Email events@bp-proof-nights.com.au for bookings',
      },
    })
    const tick = calls.find((c) => c.table === 'organiser_contacts' && c.op === 'update')
    expect(tick?.payload).toEqual({ no_marketing_statement_checked: true, page_checked_by: 'engine' })
    expect(calls.indexOf(save!)).toBeLessThan(calls.indexOf(tick!))
  })

  it('any doubt leaves the address unticked: outside a guide city, no page, not https, a copy refused, the contact unread', async () => {
    for (const r of [{ ...R, inGuideCity: false }, { ...R, pageHtml: undefined }, { ...R, pageUrl: 'http://bp-proof-nights.com.au/' }]) {
      const { db, calls } = fakeDb()
      expect(await engineCheck(db, r)).toBe('left')
      expect(calls.some((c) => c.op === 'update' || c.op === 'insert')).toBe(false)
    }
    const refused = fakeDb({ saveError: 'organiser_page_checks_copy_is_what_was_hashed' })
    expect(await engineCheck(refused.db, R)).toBe('left')
    expect(refused.calls.some((c) => c.table === 'organiser_contacts' && c.op === 'update')).toBe(false)
    const unread = fakeDb({ contact: null })
    expect(await engineCheck(unread.db, R)).toBe('left')
  })

  it('the night run hands the store the page it read and whether the organiser is in a guide city', async () => {
    const SITE = 'https://bp-proof-nights.com.au'
    const pages: Record<string, string> = { [`${SITE}/robots.txt`]: 'User-agent: *\nAllow: /', [`${SITE}/`]: '<footer><a href="mailto:events@bp-proof-nights.com.au">Email us</a></footer>' }
    const fetcher: Fetcher = async (url) => (url in pages ? { status: 200, text: async () => pages[url] } : { status: 404, text: async () => '' })
    const got: Parameters<PoolStore['record']>[0][] = []
    const store: PoolStore = {
      candidates: async () => [{ id: 'o1', name: 'BP Proof Nights', website: `${SITE}/`, known: [], inGuideCity: true }],
      record: async (r) => (got.push(r), true),
    }
    await runBasisPool(store, fetcher, new Date('2026-11-21T12:30:00Z'), Infinity, { pauseMs: 0 })
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ pageUrl: `${SITE}/`, inGuideCity: true, pageHtml: pages[`${SITE}/`] })
  })
})

describe('a person stops a check', () => {
  it('the stop is kept on the check, the contact unticked, its waiting letters back to held', async () => {
    const { db, calls } = fakeDb({ check: { id: 'k1', contact_id: 'c1', stopped_at: null } })
    const now = new Date('2026-11-21T21:00:00Z')
    expect(await stopPageCheck(db, { id: 'k1', by: 'u1', reason: 'their page asks for no marketing', now })).toEqual({ state: 'stopped', held: 2 })
    expect(calls.find((c) => c.table === 'organiser_page_checks' && c.op === 'update')?.payload).toEqual({ stopped_at: now.toISOString(), stopped_by: 'u1', stopped_reason: 'their page asks for no marketing' })
    expect(calls.find((c) => c.table === 'organiser_contacts' && c.op === 'update')?.payload).toEqual({ no_marketing_statement_checked: false, page_checked_by: null })
    const held = calls.find((c) => c.table === 'outreach_touches' && c.op === 'update')
    expect(held?.payload).toEqual({ state: 'held', scheduled_for: null })
    expect(held?.filters).toEqual(expect.arrayContaining([['eq:contact_id', 'c1'], ['eq:state', 'queued']]))
  })
  it('a check already stopped, or none, is refused', async () => {
    expect((await stopPageCheck(fakeDb({ check: { id: 'k1', contact_id: 'c1', stopped_at: '2026-11-21T20:00:00Z' } }).db, { id: 'k1', by: 'u1', reason: 'x', now: new Date() })).state).toBe('refused')
    expect((await stopPageCheck(fakeDb({ check: null }).db, { id: 'k9', by: 'u1', reason: 'x', now: new Date() })).state).toBe('refused')
  })
})

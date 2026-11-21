import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/*
 * LAW 45 (a) ON THE ROUTE ITSELF: THE WEEK from 07:00 on Wednesday, THE WEEKEND from 07:00 on Friday, Melbourne time;
 * each edition its own send record (20261121170001), claimed before the first email; no weekly approval (Lawal 02:09,
 * the PM's 02:10). Until 21 November 2026 the route refused THE WEEKEND to subscribers because 'a Friday edition would
 * read Wednesday's row as already sent', and a city went out only once an admin approved it on /admin/roundup.
 * The database, the sender, the consent ledger and the readers are faked; the route's own decisions are real.
 */
const s = vi.hoisted(() => ({
  sent: [] as { to: string; subject: string }[],
  rows: [] as { id: string; city_slug: string; edition: string; period_start: string; period_end: string; recipient_count: number; audience_count: number; completed_at: string | null; event_count: number }[],
  approvalAsked: 0,
  race: false,
}))

vi.mock('@/lib/cron/auth', () => ({ requireCronAuth: () => null }))
vi.mock('@/lib/flags/broadcast', () => ({ isFeatureEnabled: async () => true }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://www.eventlinqs.com.au' }))
vi.mock('@/lib/email/send', () => ({ sendEmail: async (m: { to: string; subject: string }) => { s.sent.push({ to: m.to, subject: m.subject }) } }))
vi.mock('@/lib/consent/resolver', () => ({ filterPermittedRecipients: async (_db: unknown, emails: string[]) => ({ permitted: emails.map((e) => e.toLowerCase()), refused: [] }) }))
vi.mock('@/lib/broadcast/roundup', () => ({ roundupApproval: async () => { s.approvalAsked += 1; return null } }))
vi.mock('@/lib/broadcast/digest', async (original) => ({
  ...(await original<typeof import('@/lib/broadcast/digest')>()),
  fetchDigestCities: async () => ['geelong'],
  fetchDigestRecipients: async () => [{ email: 'reader@example.org', source: 'consent', unsubscribeToken: '6f1c2a9e-3b4d-4c5e-8f60-718293a4b5c6' }],
  fetchDigestEvents: async () => [{ id: 'e1', slug: 'jazz-night', title: 'Jazz Night', dateLabel: 'Fri 27 Nov, 8pm', venueLabel: 'The Barwon Club', priceLabel: 'Free entry', url: 'https://www.eventlinqs.com.au/events/jazz-night' }],
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'cities') {
        const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: { slug: 'geelong', name: 'Geelong' }, error: null }) }
        return c
      }
      if (table !== 'digest_sends') throw new Error(`unexpected table ${table}`)
      const eqs: Record<string, unknown> = {}
      let since = ''
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => ((eqs[col] = v), q),
        gte: (_c: string, v: string) => ((since = v), q),
        order: () => q,
        limit: () => Promise.resolve({ data: s.rows.filter((r) => r.city_slug === eqs.city_slug && (!('edition' in eqs) || r.edition === eqs.edition) && r.period_start >= since).sort((a, b) => b.period_start.localeCompare(a.period_start)), error: null }),
        insert: (row: Omit<(typeof s.rows)[number], 'id'>) => ({
          select: () => ({
            single: async () => {
              if (s.race) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
              if (s.rows.some((r) => r.city_slug === row.city_slug && r.edition === row.edition && r.period_start === row.period_start)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
              const made = { ...row, id: `row-${s.rows.length + 1}` }
              s.rows.push(made)
              return { data: { id: made.id }, error: null }
            },
          }),
        }),
        update: (patch: Partial<(typeof s.rows)[number]>) => ({ eq: async (_c: string, id: string) => { const r = s.rows.find((x) => x.id === id); if (r) Object.assign(r, patch); return { error: null } } }),
      }
      return q
    },
  }),
}))

const call = async (iso: string, query = '') => {
  vi.setSystemTime(new Date(iso))
  const { GET } = await import('@/app/api/cron/weekly-digest/route')
  const res = await GET(new NextRequest(`https://www.eventlinqs.com.au/api/cron/weekly-digest${query}`))
  return (await res.json()) as { ok: boolean; skipped?: string; cities?: { city: string; sent?: number; skipped?: string }[] }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  s.sent.length = 0
  s.rows.length = 0
  s.approvalAsked = 0
  s.race = false
})
afterEach(() => vi.useRealTimers())

describe('the weekly digest route sends each edition at its own time, once, with no weekly approval', () => {
  it('Wednesday 07:00 in Melbourne sends THE WEEK, writes a week row, and asks no admin approval', async () => {
    const out = await call('2026-11-24T20:00:00Z')
    expect(out.cities).toEqual([expect.objectContaining({ city: 'geelong', sent: 1 })])
    expect(s.sent.map((m) => m.subject)).toEqual([expect.stringMatching(/^This week in Geelong/)])
    expect(s.rows).toEqual([expect.objectContaining({ city_slug: 'geelong', edition: 'week', period_start: '2026-11-25', recipient_count: 1, completed_at: expect.any(String) })])
    expect(s.approvalAsked).toBe(0)
  })

  it("Friday 07:00 sends THE WEEKEND although Wednesday's week row is in the window", async () => {
    await call('2026-11-24T20:00:00Z')
    const out = await call('2026-11-26T20:00:00Z')
    expect(out.cities).toEqual([expect.objectContaining({ city: 'geelong', sent: 1 })])
    expect(s.sent.map((m) => m.subject)).toEqual([expect.stringMatching(/^This week in Geelong/), expect.stringMatching(/^This weekend in Geelong/)])
    expect(s.rows.map((r) => r.edition)).toEqual(['week', 'weekend'])
  })

  it("a later firing of the same morning is a no op: the edition's row is complete", async () => {
    await call('2026-11-24T20:00:00Z')
    const again = await call('2026-11-24T21:00:00Z')
    expect(again.cities).toEqual([{ city: 'geelong', skipped: 'already_sent_this_period' }])
    expect(s.sent).toHaveLength(1)
  })

  it('a duplicate firing whose claim meets the key of a firing that began a moment before sends nothing', async () => {
    // Vercel: 'Cron delivery can also occasionally invoke the same scheduled run more than once'. Both read no row; the
    // other claimed first, so this one's insert meets the unique key (city_slug, edition, period_start).
    s.race = true
    const out = await call('2026-11-24T20:00:00Z')
    expect(out.cities).toEqual([{ city: 'geelong', skipped: 'claimed_by_another_run' }])
    expect(s.sent).toHaveLength(0)
  })

  it('an open row (a run stopped at its cap) is resumed from its own count, never opened twice', async () => {
    s.rows.push({ id: 'row-open', city_slug: 'geelong', edition: 'week', period_start: '2026-11-25', period_end: '2026-12-02', recipient_count: 0, audience_count: 1, completed_at: null, event_count: 1 })
    const out = await call('2026-11-24T21:00:00Z')
    expect(out.cities).toEqual([expect.objectContaining({ city: 'geelong', sent: 1, complete: true })])
    expect(s.rows).toEqual([expect.objectContaining({ id: 'row-open', recipient_count: 1, completed_at: expect.any(String) })])
  })

  it('outside the morning, or on another day, nothing is sent and nothing is written', async () => {
    for (const at of ['2026-11-25T22:00:00Z', '2026-11-24T19:00:00Z', '2026-11-21T20:00:00Z']) {
      const out = await call(at)
      expect(out.skipped).toBe('not_the_hour')
    }
    expect(s.sent).toHaveLength(0)
    expect(s.rows).toHaveLength(0)
  })

  it("a hand run naming the other edition is refused: the clock's edition decides", async () => {
    vi.setSystemTime(new Date('2026-11-24T20:00:00Z'))
    const { GET } = await import('@/app/api/cron/weekly-digest/route')
    const res = await GET(new NextRequest('https://www.eventlinqs.com.au/api/cron/weekly-digest?edition=weekend'))
    expect(res.status).toBe(400)
    expect(s.sent).toHaveLength(0)
  })
})

describe('the claim, read from the route', () => {
  it('the row is inserted before the send loop and closed by its id after it', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/api/cron/weekly-digest/route.ts'), 'utf8')
    const claim = src.indexOf(".insert({ city_slug: citySlug, edition,")
    const loop = src.indexOf('for (const recipient of plan.toSend)')
    expect(claim).toBeGreaterThan(0)
    expect(claim).toBeLessThan(loop)
    expect(src).toContain(".update(audit).eq('id', rowId)")
    expect(src).not.toContain('roundupApproval')
  })
})

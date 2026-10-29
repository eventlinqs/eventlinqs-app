import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The reader behind /admin/growth's organisers section (src/lib/growth/organiser-funnel.ts), on a stubbed client. Its
 * rules are tested in organiser-funnel.test.ts; this proves what the reader adds: each stage taken from its owner's
 * table and filter, a missing table carried as NOT COUNTED through every stage read through it, never 0, and the
 * listings account and seed listings left out of events per active organiser.
 *
 * The stub answers per table and per filter: a read records the filters it asked for, and the answer is chosen from
 * them, so outreach_touches read for sent messages and read for sent reports get their own rows.
 */

type Op = { readonly name: string; readonly args: readonly unknown[] }
type Answer = { data: unknown[] | null; error: { code?: string; message: string } | null }
type Resolver = (table: string, ops: readonly Op[]) => Answer

const h = vi.hoisted(() => ({ resolve: null as unknown as Resolver }))

function builder(table: string) {
  const ops: Op[] = []
  let from = 0
  const self: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'not', 'is', 'in', 'match', 'or', 'gte', 'lte', 'order', 'limit']) {
    self[name] = (...args: unknown[]) => {
      ops.push({ name, args })
      return self
    }
  }
  self.range = (f: number) => {
    from = f
    ops.push({ name: 'range', args: [f] })
    return self
  }
  self.then = (resolve: (a: Answer) => unknown, reject: (e: unknown) => unknown) => {
    try {
      const answer = h.resolve(table, ops)
      // A paged read stops at its first empty page.
      return Promise.resolve(from > 0 && answer.error === null ? { data: [], error: null } : answer).then(resolve, reject)
    } catch (err) {
      return Promise.reject(err).then(resolve, reject)
    }
  }
  return self
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => builder(table) }) }))

const { readOrganiserFunnel } = await import('@/lib/growth/organiser-funnel')

const has = (ops: readonly Op[], name: string, first?: unknown) => ops.some((o) => o.name === name && (first === undefined || o.args[0] === first))
const ok = (data: unknown[]): Answer => ({ data, error: null })
const MISSING: Answer = { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.organisers' in the schema cache" } }

const NOW = new Date('2026-10-29T09:00:00Z') // 29 October, 20:00 in Melbourne

/** Three hosts: o1 claimed as org A, o2 not claimed, o3 claimed as org B. */
function world(over: Partial<Record<string, Answer>> = {}): Resolver {
  return (table, ops) => {
    if (over[table]) return over[table] as Answer
    switch (table) {
      case 'organisers':
        return ok([
          { id: 'o1', organisation_id: 'A' },
          { id: 'o2', organisation_id: null },
          { id: 'o3', organisation_id: 'B' },
        ])
      case 'organiser_contacts':
        return ok([
          { id: 'c1', organiser_id: 'o1', basis_recorded_at: '2026-10-28T01:00:00Z' },
          { id: 'c2', organiser_id: 'o2', basis_recorded_at: null },
          { id: 'c3', organiser_id: 'o3', basis_recorded_at: '2026-10-28T02:00:00Z' },
        ])
      case 'outreach_touches':
        // Sent reports (message 8) are read with night_report_id; sent messages without.
        return has(ops, 'not', 'night_report_id') ? ok([{ id: 't9', contact_id: 'c3' }]) : ok([{ id: 't1', contact_id: 'c1' }])
      case 'organiser_permissions':
        // Read once for the yes stage (not withdrawn), once by id for the photos stage.
        return has(ops, 'in', 'id') ? ok([{ id: 'p1', organisation_id: 'A' }]) : ok([{ id: 'p1', organisation_id: 'A' }])
      case 'social_assets':
        return ok([{ id: 's1', permission_id: 'p1' }])
      case 'organiser_night_reports':
        return ok([])
      case 'organisations':
        return ok([{ id: 'L' }])
      case 'events':
        // The 90-day read goes through the listing window (.or); the months read does not.
        if (has(ops, 'or')) return ok([{ id: 'e1', organisation_id: 'B' }])
        return ok([
          { id: 'm1', organisation_id: 'A', start_date: '2026-10-10T09:00:00Z', is_seed_data: false },
          { id: 'm2', organisation_id: 'A', start_date: '2026-10-20T09:00:00Z', is_seed_data: false },
          { id: 'm3', organisation_id: 'B', start_date: '2026-09-12T09:00:00Z', is_seed_data: false },
          { id: 'm4', organisation_id: 'L', start_date: '2026-10-11T09:00:00Z', is_seed_data: false },
          { id: 'm5', organisation_id: 'C', start_date: '2026-10-12T09:00:00Z', is_seed_data: true },
        ])
      default:
        throw new Error(`the stub has no answer for ${table}`)
    }
  }
}

const stageCount = (f: Awaited<ReturnType<typeof readOrganiserFunnel>>, stage: string) => f.steps.find((s) => s.stage === stage)?.organisers

describe('readOrganiserFunnel', () => {
  beforeEach(() => {
    h.resolve = world()
  })

  it('takes each stage from its owner and its filter', async () => {
    const f = await readOrganiserFunnel(NOW)
    expect(Object.fromEntries(f.steps.map((s) => [s.stage, s.organisers]))).toEqual({
      found: 3, // every host on record
      qualified: 2, // o1 and o3 have a basis recorded; o2 does not
      invited: 1, // a message sent to c1
      claimed: 2, // o1 and o3 carry an organisation
      yes: 1, // org A's permission, not withdrawn
      photos: 1, // an approved current image under p1, org A
      publishing: 1, // org B has a night in the window
      reported: 1, // message 8 sent to c3
    })
  })

  it('reads the reports stage only through message 8 and hand-sent reports, the publishing stage only through the listing window', async () => {
    const seen: { table: string; ops: Op[] }[] = []
    const base = world()
    h.resolve = (table, ops) => {
      seen.push({ table, ops: [...ops] })
      return base(table, ops)
    }
    await readOrganiserFunnel(NOW)
    expect(seen.some((s) => s.table === 'outreach_touches' && has(s.ops, 'not', 'night_report_id') && has(s.ops, 'gte', 'sent_at'))).toBe(true)
    expect(seen.some((s) => s.table === 'organiser_night_reports' && has(s.ops, 'gte', 'sent_at'))).toBe(true)
    expect(seen.some((s) => s.table === 'events' && has(s.ops, 'or') && has(s.ops, 'lte', 'start_date'))).toBe(true)
    expect(seen.some((s) => s.table === 'events' && has(s.ops, 'gte', 'start_date') && has(s.ops, 'or'))).toBe(false)
  })

  it('carries a missing organisers table as NOT COUNTED through every stage read through it, never 0', async () => {
    h.resolve = world({ organisers: MISSING })
    const f = await readOrganiserFunnel(NOW)
    for (const stage of ['found', 'claimed', 'yes', 'photos', 'publishing', 'reported']) expect(stageCount(f, stage)).toBeNull()
    // Contacts do not need the organisers table.
    expect(stageCount(f, 'qualified')).toBe(2)
    expect(stageCount(f, 'invited')).toBe(1)
  })

  it('carries a missing contacts table into the invited stage too', async () => {
    h.resolve = world({ organiser_contacts: { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.organiser_contacts'" } } })
    const f = await readOrganiserFunnel(NOW)
    expect(stageCount(f, 'qualified')).toBeNull()
    expect(stageCount(f, 'invited')).toBeNull()
    expect(stageCount(f, 'found')).toBe(3)
  })

  it('throws on any other read failure rather than showing a stage as not counted', async () => {
    h.resolve = world({ organisers: { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } } })
    await expect(readOrganiserFunnel(NOW)).rejects.toThrow(/statement timeout/)
  })

  it('leaves the listings account and seed listings out of events per active organiser, on the platform clock', async () => {
    const f = await readOrganiserFunnel(NOW)
    expect(f.months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10'])
    const october = f.months.find((m) => m.month === '2026-10')
    expect(october).toEqual({ month: '2026-10', activeOrganisers: 1, nights: 2, perActive: 2 })
    const september = f.months.find((m) => m.month === '2026-09')
    expect(september).toEqual({ month: '2026-09', activeOrganisers: 1, nights: 1, perActive: 1 })
  })
})

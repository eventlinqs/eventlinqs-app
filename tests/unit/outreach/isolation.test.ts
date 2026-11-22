import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * ONE PLAY, ONE REPLY NEVER STOPS THE OTHERS (Lawal, 22 November 2026, 15:14; the PM's 15:15, F2 and F3). Planted failures
 * against stand-in databases: a play whose judgement read fails beside a play that drafts; a reply that fails to log
 * beside a reply that logs. The failed one is reported with its id and reason, and the other still goes.
 */

const calls = vi.hoisted(() => ({ drafts: [] as string[] }))
vi.mock('@/lib/outreach/lifecycle-play', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/outreach/lifecycle-play')>()),
  draftLifecycleLetter: vi.fn(async (_db: unknown, input: { contactId: string }) => {
    calls.drafts.push(input.contactId)
    return { state: 'queued', touchId: `t-${input.contactId}` }
  }),
}))

const { planPlays } = await import('@/lib/outreach/planner')
const { handleInbox } = await import('@/lib/outreach/replies')

type Query = { table: string; head: boolean; op: string; filters: [string, string, unknown][] }

function chain(answer: (q: Query) => { data?: unknown; count?: number; error: unknown }) {
  const from = (table: string) => {
    const q: Query = { table, head: false, op: 'select', filters: [] }
    const b: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'in', 'gte', 'lt', 'lte', 'order', 'limit', 'is', 'not']) {
      b[m] = (column: string, value: unknown) => (q.filters.push([m, column, value]), b)
    }
    b.select = (_cols?: string, opts?: { head?: boolean }) => ((q.head = q.head || opts?.head === true), b)
    b.insert = () => ((q.op = 'insert'), b)
    b.update = () => ((q.op = 'update'), b)
    b.single = async () => answer(q)
    b.maybeSingle = async () => answer(q)
    b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(answer(q)).then(ok, bad)
    return b
  }
  return { from, rpc: async () => ({ data: 10, error: null }) }
}

describe('F2: one play whose reads fail never stops the other plays', () => {
  beforeEach(() => {
    calls.drafts = []
  })

  it('the broken play is reported with its id and reason, and the law 49 play beside it still drafts', async () => {
    const db = chain((q) => {
      if (q.table === 'outreach_plays') {
        return {
          data: [
            { id: 'p-broken', name: 'A tested play', cohort_rule: {}, step1_template_id: 'tpl-a', step2_template_id: null, step3_template_id: null, variant_template_id: 'tpl-b', test_per_half: 5 },
            { id: 'p-49', name: 'Law 49 offer', cohort_rule: {}, step1_template_id: 'tpl-acq', step2_template_id: null, step3_template_id: null, variant_template_id: null, test_per_half: null },
          ],
          error: null,
        }
      }
      if (q.table === 'outreach_templates') return { data: [{ id: 'tpl-a', key: 'acq_first' }, { id: 'tpl-acq', key: 'lifecycle_acq' }], error: null }
      if (q.table === 'outreach_play_judgements') return { data: null, error: { message: 'permission denied for table outreach_play_judgements' } }
      if (q.table === 'outreach_touches' && q.head) return { count: 0, error: null }
      if (q.table === 'outreach_touches') return { data: [], error: null }
      if (q.table === 'organiser_contacts') return { data: [{ id: 'c1', organiser_id: 'o1', address: 'info@first.example', person_name: null }], error: null }
      return { data: null, error: null }
    })
    const reports = await planPlays(db as never, { now: new Date('2026-11-22T20:00:00Z'), origin: 'https://www.eventlinqs.com.au', actingUser: 'u' })
    expect(reports.find((r) => r.playId === 'p-broken')).toMatchObject({ queued: 0, error: 'outreach_play_judgements: permission denied for table outreach_play_judgements' })
    expect(reports.find((r) => r.playId === 'p-49')).toMatchObject({ queued: 1 })
    expect(calls.drafts).toEqual(['c1'])
  })
})

describe('F3: one reply that fails to log never stops the mailbox', () => {
  const message = (n: number) => ({
    graphId: `g${n}`,
    internetMessageId: `<m${n}@organiser.example>`,
    subject: 'Re: your listing',
    fromAddress: `info@organiser${n}.example`,
    fromName: 'Organiser',
    receivedAt: '2026-11-22T01:00:00Z',
    text: 'No thanks, not for us.',
    headers: {},
    hasAttachments: false,
  })

  it('the failed message is recorded with its id and reason, and the next message is logged and acted on', async () => {
    let inserts = 0
    const db = chain((q) => {
      if (q.table === 'outreach_touches') return { data: [], error: null }
      if (q.table === 'organiser_contacts') return { data: { id: `contact-${q.filters.find((f) => f[1] === 'address')?.[2]}` }, error: null }
      if (q.table === 'outreach_replies' && q.op === 'insert') {
        inserts++
        return inserts === 1 ? { data: null, error: { message: 'deadlock detected' } } : { data: { id: 'r2' }, error: null }
      }
      return { data: null, error: null }
    })
    const report = await handleInbox(db as never, [message(1), message(2)] as never, { mailbox: 'hello@eventlinqs.com', origin: 'https://www.eventlinqs.com.au', actingUser: 'u', now: new Date() })
    expect(report.failed).toEqual([{ messageId: '<m1@organiser.example>', error: 'logging a reply: deadlock detected' }])
    expect(report.replies).toEqual([{ id: 'r2', outcome: 'no', confidence: expect.any(Number), action: 'the organiser is stopped; nothing sent' }])
  })
})

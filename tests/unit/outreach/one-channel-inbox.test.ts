import { describe, expect, it } from 'vitest'
import { handleInbox } from '@/lib/outreach/replies'
import { LAWAL_MAILBOX } from '@/lib/outreach/addresses'
import { PHONE_HELD } from '@/lib/outreach/conversation'

/*
 * ONE CHANNEL PER CONVERSATION, AT THE INBOX (Lawal, 25 November 2026, 14:41 and 14:43; the PM's 14:42 and 14:43):
 * the mailbox each reply arrived in is recorded, so its answer and every message after go from it; an address their own
 * words ask us to use instead is kept on the contact; a request to be phoned or texted is held for the PM and never
 * answered by machine. Against a stand-in database.
 */
type Query = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }

function chain(answer: (q: Query) => { data?: unknown; error: unknown }) {
  const queries: Query[] = []
  const from = (table: string) => {
    const q: Query = { table, op: 'select', filters: [] }
    queries.push(q)
    const b: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'in', 'gte', 'lt', 'lte', 'order', 'limit', 'is', 'not', 'ilike']) {
      b[m] = (column: string, value: unknown) => (q.filters.push([m, column, value]), b)
    }
    b.select = () => b
    for (const op of ['insert', 'update', 'upsert']) b[op] = (payload: unknown) => ((q.op = op), (q.payload = payload), b)
    b.single = async () => answer(q)
    b.maybeSingle = async () => answer(q)
    b.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(answer(q)).then(ok, bad)
    return b
  }
  return { db: { from, rpc: async () => ({ data: null, error: null }) }, queries }
}

const message = (text: string) => ({
  graphId: 'g1',
  internetMessageId: '<theirs-1@organiser.example>',
  subject: 'Re: Your night on EventLinqs',
  fromAddress: 'info@organiser.example',
  fromName: 'Organiser',
  receivedAt: '2026-11-25T03:00:00Z',
  text,
  headers: {},
  hasAttachments: false,
})

const standard = (q: Query) => {
  if (q.table === 'organiser_contacts' && q.op === 'select') return { data: { id: 'contact-1' }, error: null }
  if (q.table === 'outreach_replies' && q.op === 'insert') return { data: { id: 'r1' }, error: null }
  return { data: null, error: null }
}

describe('one channel per conversation, at the inbox', () => {
  it('records the mailbox the reply arrived in, and keeps the address their own words ask for', async () => {
    const { db, queries } = chain(standard)
    const report = await handleInbox(db as never, [message('Yes please. Could you email me at bookings@organiser.example instead?')] as never, {
      mailbox: LAWAL_MAILBOX,
      origin: 'https://www.eventlinqs.com.au',
      actingUser: 'u',
      now: new Date('2026-11-25T03:05:00Z'),
    })
    expect(report.failed).toEqual([])
    expect(queries.find((q) => q.table === 'outreach_message_mailboxes')).toMatchObject({
      op: 'upsert',
      payload: { internet_message_id: '<theirs-1@organiser.example>', mailbox: LAWAL_MAILBOX, direction: 'received' },
    })
    const moved = queries.find((q) => q.table === 'organiser_contacts' && q.op === 'update')
    expect(moved?.payload).toEqual({ stated_address: 'bookings@organiser.example', stated_address_at: '2026-11-25T03:00:00Z', stated_address_reply: 'r1' })
    expect(moved?.filters).toContainEqual(['eq', 'id', 'contact-1'])
    expect(report.replies[0].action).toContain('their stated address bookings@organiser.example is kept for every message after')
  })

  it('no request, no move: the contact is left as it is', async () => {
    const { db, queries } = chain(standard)
    await handleInbox(db as never, [message('Yes please, that sounds great.')] as never, { mailbox: LAWAL_MAILBOX, origin: 'https://www.eventlinqs.com.au', actingUser: 'u', now: new Date() })
    expect(queries.some((q) => q.table === 'organiser_contacts' && q.op === 'update')).toBe(false)
  })

  it('a request to be phoned is held for the PM, with no answer drafted', async () => {
    const { db, queries } = chain(standard)
    const report = await handleInbox(db as never, [message('How much does it cost? Best to call me on 0412 345 678.')] as never, {
      mailbox: LAWAL_MAILBOX,
      origin: 'https://www.eventlinqs.com.au',
      actingUser: 'u',
      now: new Date(),
    })
    const logged = queries.find((q) => q.table === 'outreach_replies' && q.op === 'insert')
    expect((logged?.payload as { needs_lawal: boolean }).needs_lawal).toBe(true)
    expect(report.replies[0].action.startsWith(PHONE_HELD)).toBe(true)
    // No answer is drafted: its template is never read.
    expect(queries.some((q) => q.table === 'outreach_templates')).toBe(false)
  })
})

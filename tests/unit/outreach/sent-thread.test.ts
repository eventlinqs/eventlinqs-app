import { describe, expect, it, vi } from 'vitest'
import { planSentSync, type SentMail } from '@/lib/outreach/sent-sync-math'

/*
 * EVERY MESSAGE WE SEND, ON RECORD (the PM's 16:28 of 25 November 2026, item 2). Red before: the Sent Items sync recorded
 * a message only when it went to an address that is a contact of ours, so Lawal's hand sent answer to Bendigo Tourism of
 * 24 November (to tourismshared@, no contact) was never recorded, and her yes that answered it matched nobody. Now a
 * message to an address that is no contact is matched to its thread as the inbox matches (its thread headers, then
 * Outlook's conversation), recorded on the thread's contact, and its address becomes a contact of the same organiser; and
 * every message the mailbox sent is kept with its contact, or none, so mail sent by hand is never missing.
 */
const sent: { rows: unknown[]; inserts: { table: string; payload: unknown }[] } = vi.hoisted(() => ({ rows: [], inserts: [] }))

vi.mock('@/lib/outreach/twenty-drafts', () => ({ founderAccount: async () => ({ id: 'u-founder' }) }))
vi.mock('@/lib/outreach/graph', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/outreach/graph')>()),
  graphReadSentItems: async () => [
    {
      graphId: 'g1',
      internetMessageId: '<SYYP-hand@outlook>',
      subject: 'RE: Bendigo Region events on EventLinqs',
      toAddresses: ['shared@bendigo.example'],
      sentAt: '2026-11-24T09:52:51Z',
      text: 'Hi Jessica,\nThanks for asking ... EventLinqs',
      conversationId: 'AAQkBENDIGO',
      threadIds: ['<her-question@bendigo.example>'],
    },
    { graphId: 'g2', internetMessageId: '<personal@outlook>', subject: 'Lunch', toAddresses: ['friend@else.example'], sentAt: '2026-11-24T10:00:00Z', text: 'Hi', conversationId: 'AAQkOTHER', threadIds: [] },
  ],
}))

const { syncSentItems } = await import('@/lib/outreach/sent-sync')

type Q = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][]; head?: boolean }
function fakeDb() {
  const from = (table: string) => {
    const q: Q = { table, op: 'select', filters: [] }
    const b: Record<string, unknown> = {}
    for (const m of ['eq', 'neq', 'in', 'order', 'limit', 'is', 'not', 'gte']) b[m] = (c: string, v: unknown) => (q.filters.push([m, c, v]), b)
    b.select = (_c?: string, o?: { head?: boolean }) => ((q.head = o?.head === true), b)
    for (const op of ['insert', 'update', 'upsert']) b[op] = (p: unknown) => ((q.op = op), (q.payload = p), b)
    const has = (m: string, c: string) => q.filters.some(([fm, fc]) => fm === m && fc === c)
    const answer = () => {
      if (q.op === 'upsert' && table === 'outreach_message_mailboxes') {
        sent.rows.push(...(q.payload as unknown[]))
        return { data: null, error: null }
      }
      if (q.op === 'insert') {
        sent.inserts.push({ table, payload: q.payload })
        return { data: { id: table === 'organiser_contacts' ? 'c-shared' : 't-recorded' }, error: null }
      }
      if (table === 'outreach_replies' && has('in', 'source_message_id')) return { data: [{ contact_id: 'c-bendigo', touch_id: 't-letter' }], error: null }
      if (table === 'outreach_replies' && q.head) return { count: 1, error: null }
      if (table === 'outreach_touches' && q.head) return { count: 1, error: null }
      if (table === 'outreach_touches' && has('eq', 'id')) return { data: { id: 't-letter', subject: 'Bendigo Region events on EventLinqs', context_key: null }, error: null }
      if (table === 'organiser_contacts' && has('eq', 'address')) return { data: null, error: null }
      if (table === 'organiser_contacts' && has('eq', 'id')) return { data: { organiser_id: 'o-bendigo' }, error: null }
      return { data: [], error: null }
    }
    b.single = async () => answer()
    b.maybeSingle = async () => answer()
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(answer()).then(ok)
    return b
  }
  return { from } as never
}

describe("every message we send, on record with its thread's contact", () => {
  it('the plan names each message to no contact of ours, for the thread road', () => {
    const m: SentMail = { internetMessageId: '<a@x>', subject: 's', toAddresses: ['nobody@else.example'], sentAt: '2026-11-24T00:00:00Z', text: 'Hi' }
    expect(planSentSync([m], [], [], new Set()).unmatched).toEqual([m])
  })

  it("a hand sent answer to a new address in a thread of ours is recorded on the thread's contact; every message is kept", async () => {
    const r = await syncSentItems(fakeDb(), { tenantId: 't', clientId: 'c', clientSecret: 's', mailbox: 'hello@eventlinqs.com' }, { sinceIso: '2026-11-23T00:00:00Z' })
    expect(r).toMatchObject({ state: 'synced', read: 2, byThread: 1, notContacts: 1, recorded: 1 })
    // The new address becomes a contact of the same organiser, on the basis of their own message.
    expect(sent.inserts.find((i) => i.table === 'organiser_contacts')?.payload).toMatchObject({ organiser_id: 'o-bendigo', address: 'shared@bendigo.example', basis: 'none' })
    // The answer recorded on the thread's contact, as a reply sent by hand.
    expect(sent.inserts.find((i) => i.table === 'outreach_touches')?.payload).toMatchObject({ contact_id: 'c-bendigo', provider: 'by_hand', internet_message_id: '<SYYP-hand@outlook>' })
    // Both kept with their mailbox: the answer with its contact, the personal note with none.
    expect(sent.rows).toEqual([
      expect.objectContaining({ internet_message_id: '<SYYP-hand@outlook>', mailbox: 'hello@eventlinqs.com', direction: 'sent', counterpart_address: 'shared@bendigo.example', conversation_id: 'AAQkBENDIGO', contact_id: 'c-bendigo' }),
      expect.objectContaining({ internet_message_id: '<personal@outlook>', direction: 'sent', contact_id: null }),
    ])
  })
})

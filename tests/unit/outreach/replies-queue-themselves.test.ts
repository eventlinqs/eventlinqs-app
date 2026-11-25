import { describe, expect, test, vi } from 'vitest'

// The voice rules themselves are held by the voice gate's own tests and by the gateway case below; here a draft's voice
// answer is set by the case, so each of the reply queue's own checks is drilled alone.
vi.mock('@/lib/outreach/daily-queue', () => ({ readTouchVoice: vi.fn(async (_db: unknown, id: string) => (id === 'gone' ? null : { id })) }))
vi.mock('@/lib/outreach/voice-gate', async (orig) => ({
  ...(await orig<typeof import('@/lib/outreach/voice-gate')>()),
  voiceProblems: (msg: { id: string }) => (msg.id === 'bad-words' ? ['no dashes'] : []),
}))

import { REPLY_TEMPLATE_KEYS, queueApprovedReplies, standingApprovals, standingClear, type StandingApproval } from '@/lib/outreach/self-queue'
import { renderTemplate } from '@/lib/outreach/rules'
import { replyProblems, replyText } from '@/lib/comms/approve-and-send'
import { readVoicePolicy } from '@/lib/outreach/voice-gate'

/*
 * REPLIES GO BY THEMSELVES (Lawal, 25 November 2026, 07:02, verbatim through the PM's 07:03: "The system should be able
 * to send it from my mailbox and not have to have me approve it."; the PM's 07:03 item 4: "a question with an approved
 * template answers by itself"). Until today no reply template could clear: each rendered Lawal's full ABN signature,
 * which the voice gate refuses in a reply, and every reply draft was stored held for a tap.
 */

/** Production's reply_cost version 1, word for word (outreach_templates, read 25 November 2026, 09:04:40). */
const REPLY_COST_V1 = {
  channel: 'email' as const,
  purpose: 'reply' as const,
  step: null,
  subject: 'Re: [thread subject]',
  body: "Hi [first name],\nNothing. Listing and featuring are free. If you ever want to sell tickets through EventLinqs, that's optional and I can send the details then.\nKind regards,\n[signature]\n\n[unsubscribe]",
}
const TOKEN = '00000000-0000-4000-8000-000000000005'
const UNSUBSCRIBE = `https://www.eventlinqs.com.au/unsubscribe/outreach?t=${TOKEN}`
const THREAD = 'Complimentary EventLinqs listing for Stage 29 Studios'
const COST = standingApprovals().find((a) => a.key === 'reply_cost' && a.version === 1) as StandingApproval

describe("a reply on a template his standing approval holds is the template with only its fields filled", () => {
  test('reply_cost v1 renders with the reply signature, no ABN block, and passes every message rule', () => {
    const r = renderTemplate(REPLY_COST_V1, { 'first name': 'Jennifer', 'thread subject': THREAD }, UNSUBSCRIBE)
    expect(r.heldBecause).toEqual([])
    expect(r.body).not.toContain('ABN')
    expect(r.body).toContain('Kind regards,\nLawal Adams\nFounder, EventLinqs')
    expect(COST).toMatchObject({ on: true })
    const clear = standingClear({ template: 'reply_cost v1', subject: r.subject ?? '', body: r.body }, COST.policy_version)
    expect(clear).toMatchObject({ cleared: true })
    // Changed by one sentence, it no longer clears.
    expect(standingClear({ template: 'reply_cost v1', subject: r.subject ?? '', body: r.body.replace('Listing and featuring are free.', 'Listing is free.') }, COST.policy_version).cleared).toBe(false)
  })
  test("the gateway's reply rules pass it, greeting her by her own name", () => {
    const r = renderTemplate(REPLY_COST_V1, { 'first name': 'Jennifer', 'thread subject': THREAD }, UNSUBSCRIBE)
    const policy = readVoicePolicy()
    expect(replyProblems({ from: 'lawal@eventlinqs.com', to: 'info@stage29studios.com.au', subject: r.subject ?? '', greetingName: 'Jennifer', threadRef: '<abc@stage29studios.com.au>', text: replyText(r.body) }, policy)).toEqual([])
  })
  test('only the templates true today are on: no promise the engine does not keep goes by itself', () => {
    const on = standingApprovals().filter((a) => a.on && REPLY_TEMPLATE_KEYS.includes(a.key)).map((a) => `${a.key} v${a.version}`)
    expect(on.sort()).toEqual(['reply_cost v1', 'reply_existing_ticketing v1'])
  })
})

describe('the reply queue', () => {
  type Call = { table: string; op: string; payload: unknown; filters: [string, unknown][] }
  type Theirs = { received_at: string; outcome: string; wording: string; touch_id: string | null }
  const fakeDb = (rows: { id: string; template: string; subject: string; body: string; heldBecause?: string[] }[], mode = 'live', theirs: Theirs | null = null) => {
    const calls: Call[] = []
    const from = (table: string) => {
      const call: Call = { table, op: 'select', payload: null, filters: [] }
      const id = () => call.filters.find(([k]) => k === 'eq:id')?.[1] as string | undefined
      const answer = () => {
        if (table === 'outreach_sender') return { data: { mode }, error: null }
        if (table === 'outreach_touches' && call.op === 'update') return { data: { id: id() }, error: null }
        if (table === 'outreach_touches') {
          return {
            data: rows.map((r) => {
              const [key, v] = r.template.split(' v')
              return { id: r.id, contact_id: `c-${r.id}`, subject: r.subject, body: r.body, held_because: r.heldBecause ?? [], outreach_templates: { key, version: Number(v) } }
            }),
            error: null,
          }
        }
        if (table === 'organiser_contacts') return { data: { organiser_id: 'o1' }, error: null }
        if (table === 'organiser_venues') return { data: [], error: null }
        // The message the answer answers (by its id): when it arrived and what it said.
        if (table === 'outreach_replies') return { data: theirs, error: null }
        return { data: null, error: { message: `unexpected ${call.op} on ${table}` } }
      }
      const done = () => (calls.push(call), Promise.resolve(answer()))
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => (call.filters.push([`eq:${k}`, v]), b),
        in: (k: string, v: unknown) => (call.filters.push([`in:${k}`, v]), b),
        not: (k: string, o: string, v: unknown) => (call.filters.push([`not:${k}:${o}`, v]), b),
        limit: () => b,
        update: (p: unknown) => ((call.op = 'update'), (call.payload = p), b),
        single: done,
        maybeSingle: done,
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) => done().then(ok, no),
      }
      return b
    }
    return { db: { from } as never, calls }
  }
  const NOW = new Date('2026-11-24T23:30:00Z') // Wednesday 10:30 in Melbourne, after the window closed
  const THURSDAY_6 = '2026-11-25T19:00:00.000Z'
  const policy = { version: COST.policy_version } as never
  const cost = renderTemplate(REPLY_COST_V1, { 'first name': 'Jennifer', 'thread subject': THREAD }, UNSUBSCRIBE)

  // HOW FAST WE ANSWER (Lawal, 25 November 2026, 15:14 and 15:16; src/lib/outreach/answer-timing.ts): an answer is not
  // outreach, so it is never held to law 44's next window (it was: Thursday 06:00, THURSDAY_6, for a question asked at
  // 10:20 on Wednesday); a reply to our letter goes an hour or so after it arrived, the same day.
  test('a held answer on reply_cost, words passing, in their thread, queues itself for its own time, never the next window', async () => {
    const asked = { received_at: '2026-11-24T23:20:00Z', outcome: 'question', wording: 'How much does it cost?', touch_id: null }
    const { db, calls } = fakeDb([{ id: 'cost', template: 'reply_cost v1', subject: cost.subject ?? '', body: cost.body }], 'live', asked)
    const r = await queueApprovedReplies(db, { now: NOW, policy, random: () => 0 })
    const AT = '2026-11-25T00:20:00.000Z' // Wednesday 11:20: an hour after it arrived
    expect(AT).not.toBe(THURSDAY_6)
    expect(r.queued).toEqual([expect.objectContaining({ id: 'cost', at: AT, why: expect.stringContaining('standing approval of reply_cost v1') })])
    expect(r.queued[0].why).toContain('answered as letter')
    expect(calls.find((c) => c.op === 'update')?.payload).toEqual({ state: 'queued', scheduled_for: AT })
    const read = calls.find((c) => c.table === 'outreach_touches' && c.op === 'select')
    expect(read?.filters).toEqual(expect.arrayContaining([['eq:state', 'held'], ['in:purpose', ['reply', 'relationship']], ['not:in_reply_to:is', null]]))
  })

  test('the message it answers not on record: it waits, never queued for a guessed time', async () => {
    const { db, calls } = fakeDb([{ id: 'cost', template: 'reply_cost v1', subject: cost.subject ?? '', body: cost.body }], 'live', null)
    const r = await queueApprovedReplies(db, { now: NOW, policy, random: () => 0 })
    expect(r.queued).toEqual([])
    expect(r.waiting).toEqual([{ id: 'cost', reasons: ['the message it answers is not on record'] }])
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  test('a template off his standing approval, failed words, a failed rule or a changed sentence: it waits, never queued', async () => {
    const { db, calls } = fakeDb([
      { id: 'thanks', template: 'thank_you v1', subject: `Re: ${THREAD}`, body: 'Hi Jennifer,\nThank you, that is great.' },
      { id: 'bad-words', template: 'reply_cost v1', subject: cost.subject ?? '', body: cost.body },
      { id: 'unfilled', template: 'reply_cost v1', subject: cost.subject ?? '', body: cost.body, heldBecause: ['a field could not be filled from verified facts: [first name]'] },
      { id: 'changed', template: 'reply_cost v1', subject: cost.subject ?? '', body: cost.body.replace('Listing and featuring are free.', 'Listing is free.') },
    ])
    const r = await queueApprovedReplies(db, { now: NOW, policy })
    expect(r.queued).toEqual([])
    expect(r.waiting.map((w) => w.id).sort()).toEqual(['bad-words', 'changed', 'thanks', 'unfilled'])
    expect(r.waiting.find((w) => w.id === 'thanks')?.reasons.join(' ')).toContain('no standing approval for thank_you v1')
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  test('a draft on a template that is no reply is left to its own path; with the sender not live nothing queues', async () => {
    const other = fakeDb([{ id: 'first', template: 'acq_first v1', subject: 'x', body: 'y' }])
    const r = await queueApprovedReplies(other.db, { now: NOW, policy })
    expect(r.queued).toEqual([])
    expect(r.waiting).toEqual([])
    for (const mode of ['test', 'hold']) {
      const { db, calls } = fakeDb([{ id: 'cost', template: 'reply_cost v1', subject: cost.subject ?? '', body: cost.body }], mode)
      const held = await queueApprovedReplies(db, { now: NOW, policy })
      expect(held.queued).toEqual([])
      expect(held.note).toContain(`the sender is ${mode}`)
      expect(calls.some((c) => c.op === 'update')).toBe(false)
    }
  })
})

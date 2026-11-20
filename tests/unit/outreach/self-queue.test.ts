import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'

// The voice rules themselves are held by tests/unit/outreach/voice-gate tests; here a letter's voice answer is set by the
// case, so each of the self queue's own checks is drilled alone.
vi.mock('@/lib/outreach/daily-queue', () => ({ readTouchVoice: vi.fn(async (_db: unknown, id: string) => (id === 'gone' ? null : { id })) }))
vi.mock('@/lib/outreach/voice-gate', async (orig) => ({
  ...(await orig<typeof import('@/lib/outreach/voice-gate')>()),
  voiceProblems: (msg: { id: string }) => (msg.id === 'bad-words' ? ['no dashes'] : []),
}))

import { nextWindowStart, queueApprovedHeldLetters, standingApprovals, standingClear, type StandingApproval } from '@/lib/outreach/self-queue'

/*
 * NO DAILY PRESS (the PM's item 2 of 00:05:52, 21 November 2026): a held first letter that clears under Lawal's standing
 * approval of its exact template queues itself into the next business window; an unapproved template or a failed check
 * never does. The rule is the gateway's own (C:\dev\comms-gateway\gateway.py standing_clear), ported line for line.
 */

const APPROVAL = standingApprovals().find((a) => a.key === 'acq_first' && a.version === 1) as StandingApproval
const POLICY = APPROVAL.policy_version
const TOKEN = '00000000-0000-4000-8000-000000000001'

/** The approved template with its fields filled, as the drafting engine fills it. */
function letter(organiser: string, city: string, opts: { slug?: string; subject?: string; greeting?: string } = {}) {
  const fill = (t: string) =>
    t
      .replace('Hi [organiser] team,', `Hi ${opts.greeting ?? organiser} team,`)
      .replaceAll('[organiser]', organiser)
      .replace('[what they run, or events]', 'events')
      .replace('/city/[city]', `/city/${opts.slug ?? city.toLowerCase().replace(/ /g, '-')}`)
      .replaceAll('[city]', city)
      .replace('[unsubscribe link]', `https://www.eventlinqs.com.au/unsubscribe/outreach?t=${TOKEN}`)
  return { template: 'acq_first v1', subject: opts.subject ?? fill(APPROVAL.subject), body: fill(APPROVAL.body) }
}

describe("the gateway's standing rule, ported", () => {
  test('the approved template with only its fields filled clears, quoting his words', () => {
    const r = standingClear(letter('Bendigo Symphony Orchestra', 'Bendigo'), POLICY)
    expect(r.cleared).toBe(true)
    expect(r.reason).toContain(APPROVAL.words.trim().slice(0, 40))
  })
  test('a subject that is not the template, even an approved standard subject, does not clear', () => {
    const r = standingClear(letter('Next Stop Comedy', 'Geelong', { subject: 'Complimentary listing in our Geelong events guide' }), POLICY)
    expect(r).toEqual({ cleared: false, reason: "the letter's subject is not acq_first v1 with only its fields filled" })
  })
  test('a changed sentence, a field filled two ways, or a guide link to another city does not clear', () => {
    const changed = letter('Where You Meet', 'Geelong')
    expect(standingClear({ ...changed, body: changed.body.replace("I hope you're well.", 'Hope all is well.') }, POLICY).cleared).toBe(false)
    expect(standingClear(letter('Where You Meet', 'Geelong', { greeting: 'Someone Else' }), POLICY).reason).toBe("the field 'organiser' is filled two ways")
    expect(standingClear(letter('Where You Meet', 'Geelong', { slug: 'melbourne' }), POLICY).reason).toBe("the guide link is not the letter's own city")
  })
  test('an approval that is off, carries no words, was given under another policy, or another template: none clears', () => {
    const l = letter('Bendigo Symphony Orchestra', 'Bendigo')
    expect(standingClear(l, POLICY, [{ ...APPROVAL, on: false }]).cleared).toBe(false)
    expect(standingClear(l, POLICY, [{ ...APPROVAL, words: ' ' }]).cleared).toBe(false)
    expect(standingClear(l, 'ffffffffffffffff').reason).toBe('the voice policy changed since the standing approval: Lawal approves again')
    expect(standingClear({ ...l, template: 'acq_first v2' }, POLICY).reason).toBe('no standing approval for acq_first v2')
  })
  test("the app's copy is the gateway's own record, where both are on one machine", () => {
    const gateway = 'C:\\dev\\comms-gateway\\standing-approvals.json'
    if (!existsSync(gateway)) return
    expect(standingApprovals()).toEqual(JSON.parse(readFileSync(gateway, 'utf8')).templates)
  })
})

describe('the next business window, from today (law 42)', () => {
  test('Saturday after midnight in Melbourne: Monday 9:00', () => {
    expect(nextWindowStart(new Date('2026-11-20T13:30:00Z'), 'Australia/Melbourne').toISOString()).toBe('2026-11-22T22:00:00.000Z')
  })
  test('inside the window: now; after five on a Friday: Monday 9:00; Perth keeps its own clock', () => {
    const tuesday10 = new Date('2026-11-23T23:00:00Z')
    expect(nextWindowStart(tuesday10, 'Australia/Melbourne')).toBe(tuesday10)
    expect(nextWindowStart(new Date('2026-11-27T07:00:00Z'), 'Australia/Melbourne').toISOString()).toBe('2026-11-29T22:00:00.000Z')
    expect(nextWindowStart(new Date('2026-11-20T13:30:00Z'), 'Australia/Perth').toISOString()).toBe('2026-11-23T01:00:00.000Z')
  })
})

describe('the self queue', () => {
  type Call = { table: string; op: string; payload: unknown; filters: [string, unknown][] }
  const fakeDb = (rows: { id: string; template: string; checked?: boolean; basis?: string | null; mail: ReturnType<typeof letter> }[], mode = 'live') => {
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
              return { id: r.id, contact_id: `c-${r.id}`, subject: r.mail.subject, body: r.mail.body, outreach_templates: { key, version: Number(v) } }
            }),
            error: null,
          }
        }
        if (table === 'organiser_contacts') {
          const r = rows.find((x) => `c-${x.id}` === id())
          return { data: { basis: r?.basis === undefined ? 'conspicuous_publication' : r.basis, no_marketing_statement_checked: r?.checked ?? true, organiser_id: 'o1' }, error: null }
        }
        if (table === 'organiser_venues') return { data: [], error: null }
        return { data: null, error: { message: `unexpected ${call.op} on ${table}` } }
      }
      const done = () => (calls.push(call), Promise.resolve(answer()))
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => (call.filters.push([`eq:${k}`, v]), b),
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
  const NOW = new Date('2026-11-20T13:30:00Z') // Saturday 00:30 in Melbourne
  const MONDAY_9 = '2026-11-22T22:00:00.000Z'
  const policy = { version: POLICY } as never

  test('a held letter on the approved template, words passing and page checked, queues itself for Monday 9:00', async () => {
    const { db, calls } = fakeDb([{ id: 'ok', template: 'acq_first v1', mail: letter('Bendigo Symphony Orchestra', 'Bendigo') }])
    const r = await queueApprovedHeldLetters(db, { now: NOW, policy })
    expect(r.queued).toEqual([expect.objectContaining({ id: 'ok', at: MONDAY_9 })])
    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({ state: 'queued', scheduled_for: MONDAY_9 })
    expect(update?.filters).toEqual(expect.arrayContaining([['eq:id', 'ok'], ['eq:state', 'held']]))
  })

  test('an unapproved template, a subject off the template, failed words or no recorded page check: never queued', async () => {
    const { db, calls } = fakeDb([
      { id: 'v2', template: 'acq_first v2', mail: letter('Bendigo Symphony Orchestra', 'Bendigo') },
      { id: 'geelong', template: 'acq_first v1', mail: letter('Next Stop Comedy', 'Geelong', { subject: 'Complimentary listing in our Geelong events guide' }) },
      { id: 'bad-words', template: 'acq_first v1', mail: letter('Stage 29 Studios', 'Bendigo') },
      { id: 'unchecked', template: 'acq_first v1', checked: false, mail: letter('Where You Meet', 'Geelong') },
      { id: 'no-basis', template: 'acq_first v1', basis: null, mail: letter('Tipsy Sketching Club', 'Geelong') },
    ])
    const r = await queueApprovedHeldLetters(db, { now: NOW, policy })
    expect(r.queued).toEqual([])
    expect(r.waiting.map((w) => w.id).sort()).toEqual(['bad-words', 'geelong', 'no-basis', 'unchecked', 'v2'])
    expect(calls.some((c) => c.op === 'update')).toBe(false)
    expect(r.waiting.find((w) => w.id === 'unchecked')?.reasons.join(' ')).toContain('is not recorded')
  })

  test('with the sender in test or hold mode nothing queues itself, so test mode never fails a letter', async () => {
    for (const mode of ['test', 'hold']) {
      const { db, calls } = fakeDb([{ id: 'ok', template: 'acq_first v1', mail: letter('Bendigo Symphony Orchestra', 'Bendigo') }], mode)
      const r = await queueApprovedHeldLetters(db, { now: NOW, policy })
      expect(r.queued).toEqual([])
      expect(r.note).toContain(`the sender is ${mode}`)
      expect(calls.some((c) => c.op === 'update')).toBe(false)
    }
  })
})

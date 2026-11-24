import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'

// The voice rules themselves are held by tests/unit/outreach/voice-gate tests; here a letter's voice answer is set by the
// case, so each of the self queue's own checks is drilled alone.
vi.mock('@/lib/outreach/daily-queue', () => ({ readTouchVoice: vi.fn(async (_db: unknown, id: string) => (id === 'gone' ? null : { id })) }))
vi.mock('@/lib/outreach/voice-gate', async (orig) => ({
  ...(await orig<typeof import('@/lib/outreach/voice-gate')>()),
  voiceProblems: (msg: { id: string }) => (msg.id === 'bad-words' ? ['no dashes'] : []),
}))

import {
  SELF_QUEUED_FIRST_LETTERS,
  gatewayContentHash,
  gatewayFirstLetter,
  letterApprovals,
  nextWindowStart,
  ownApprovalClear,
  queueApprovedHeldLetters,
  standingApprovals,
  standingClear,
  type LetterApproval,
  type StandingApproval,
} from '@/lib/outreach/self-queue'
import { SOURCE_ASK_DEFAULT_ASK, SOURCE_ASK_EMAIL, SOURCE_ASK_EMAIL_V1, draftSourceAsk, type SourceAskData } from '@/lib/outreach/source-asks'
import { HELLO_MAILBOX } from '@/lib/outreach/addresses'

/** The five sources of 23 November 2026, each drafted through source_ask v2 with the ask for a source with no term to name. */
const SOURCE_LINK_ID = '00000000-0000-4000-8000-000000000004'
const SOURCES = (JSON.parse(readFileSync('scripts/ops/data/source-asks-23nov.json', 'utf8')) as SourceAskData).asks
const SOURCE_URL = `https://www.eventlinqs.com.au/unsubscribe/outreach?t=${SOURCE_LINK_ID}`
const SOURCE_DRAFTS = SOURCES.map((a) => draftSourceAsk({ ...a, askLine: SOURCE_ASK_DEFAULT_ASK }, SOURCE_URL))
/** The same sources as version 1 drafted them (the letters of 24 November), which no longer clear. */
const SOURCE_DRAFTS_V1 = SOURCES.map((a) => draftSourceAsk(a, SOURCE_URL, SOURCE_ASK_EMAIL_V1))

/*
 * NO DAILY PRESS (the PM's item 2 of 00:05:52, 21 November 2026): a held first letter that clears under Lawal's standing
 * approval of its exact template queues itself into the next business window; an unapproved template or a failed check
 * never does. The rule is the gateway's own (C:\dev\comms-gateway\gateway.py standing_clear), ported line for line.
 */

const APPROVAL = standingApprovals().find((a) => a.key === 'acq_first' && a.version === 1) as StandingApproval
const POLICY = APPROVAL.policy_version
const TOKEN = '00000000-0000-4000-8000-000000000001'
const ADDRESS = 'info@venue.example'

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
  return { template: 'acq_first v1', subject: opts.subject ?? fill(APPROVAL.subject), body: fill(APPROVAL.body), to: ADDRESS }
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
    expect(standingClear({ ...l, template: 'acq_first v9' }, POLICY).reason).toBe('no standing approval for acq_first v9')
    // v1's words under v2's name do not clear: v2 is v1 with the pleasantry taken out (Lawal, 20:45 of 22 November 2026).
    expect(standingClear({ ...l, template: 'acq_first v2' }, POLICY).reason).toBe("the letter's body is not acq_first v2 with only its fields filled")
  })
  test("the app's copy is the gateway's own record, where both are on one machine", () => {
    const gateway = 'C:\\dev\\comms-gateway\\standing-approvals.json'
    if (!existsSync(gateway)) return
    expect(standingApprovals()).toEqual(JSON.parse(readFileSync(gateway, 'utf8')).templates)
  })
})

describe('the next sending window, from today (laws 42 and 44)', () => {
  test('Saturday after midnight in Melbourne: the same Saturday at 06:00', () => {
    expect(nextWindowStart(new Date('2026-11-20T13:30:00Z'), 'Australia/Melbourne').toISOString()).toBe('2026-11-20T19:00:00.000Z')
  })
  test('inside the window: now; Saturday after nine: Monday at 06:00, never a Sunday; Perth keeps its own clock', () => {
    const tuesday7 = new Date('2026-11-23T20:00:00Z')
    expect(nextWindowStart(tuesday7, 'Australia/Melbourne')).toBe(tuesday7)
    expect(nextWindowStart(new Date('2026-11-20T23:00:00Z'), 'Australia/Melbourne').toISOString()).toBe('2026-11-22T19:00:00.000Z')
    expect(nextWindowStart(new Date('2026-11-20T13:30:00Z'), 'Australia/Perth').toISOString()).toBe('2026-11-20T22:00:00.000Z')
    const weekdays = { days: [1, 2, 3, 4, 5], fromMinute: 540, untilMinute: 1020 }
    expect(nextWindowStart(new Date('2026-11-20T13:30:00Z'), 'Australia/Melbourne', weekdays).toISOString()).toBe('2026-11-22T22:00:00.000Z')
  })
})

describe('the self queue', () => {
  type Call = { table: string; op: string; payload: unknown; filters: [string, unknown][] }
  const fakeDb = (
    rows: { id: string; template: string; checked?: boolean; basis?: string | null; mail: ReturnType<typeof letter> }[],
    mode = 'live',
    queuedRows: { id: string; contact_id: string; scheduled_for: string }[] = [],
  ) => {
    const calls: Call[] = []
    const from = (table: string) => {
      const call: Call = { table, op: 'select', payload: null, filters: [] }
      const id = () => call.filters.find(([k]) => k === 'eq:id')?.[1] as string | undefined
      const answer = () => {
        if (table === 'outreach_sender') return { data: { mode }, error: null }
        if (table === 'outreach_touches' && call.op === 'update') return { data: { id: id() }, error: null }
        if (table === 'outreach_touches' && call.filters.some(([k, v]) => k === 'eq:state' && v === 'queued')) return { data: queuedRows, error: null }
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
          return { data: { basis: r?.basis === undefined ? 'conspicuous_publication' : r.basis, no_marketing_statement_checked: r?.checked ?? true, organiser_id: 'o1', address: ADDRESS }, error: null }
        }
        if (table === 'organiser_venues') return { data: [], error: null }
        return { data: null, error: { message: `unexpected ${call.op} on ${table}` } }
      }
      const done = () => (calls.push(call), Promise.resolve(answer()))
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => (call.filters.push([`eq:${k}`, v]), b),
        or: (f: string) => (call.filters.push(['or', f]), b),
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
  const SATURDAY_6 = '2026-11-20T19:00:00.000Z'
  const policy = { version: POLICY } as never

  test('a held letter on the approved template, words passing and page checked, queues itself for Saturday at 06:00', async () => {
    const { db, calls } = fakeDb([{ id: 'ok', template: 'acq_first v1', mail: letter('Bendigo Symphony Orchestra', 'Bendigo') }])
    const r = await queueApprovedHeldLetters(db, { now: NOW, policy })
    expect(r.queued).toEqual([expect.objectContaining({ id: 'ok', at: SATURDAY_6 })])
    const update = calls.find((c) => c.op === 'update')
    expect(update?.payload).toEqual({ state: 'queued', scheduled_for: SATURDAY_6 })
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
    // The engine's own page check clears an address, never a person's (the PM's 15:48 of 22 November 2026, F5 (c)).
    expect(r.waiting.find((w) => w.id === 'unchecked')?.reasons.join(' ')).toContain("the engine's page check has not read its address yet")
    expect(r.waiting.find((w) => w.id === 'unchecked')?.reasons.join(' ')).not.toContain("a person's")
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

  // LAW 42 (b) and LAW 44: a first letter queued under an earlier window (AL's Monday to Friday, 9:00) goes at the
  // current window's next opening; one already slotted at or before it is never touched.
  test('a first letter queued for Monday 9:00 under the old window is brought to Saturday 06:00; one at 06:00 stays', async () => {
    const { db, calls } = fakeDb([], 'live', [
      { id: 'old-window', contact_id: 'c-old', scheduled_for: '2026-11-22T22:00:00.000Z' },
      { id: 'in-window', contact_id: 'c-in', scheduled_for: SATURDAY_6 },
    ])
    const r = await queueApprovedHeldLetters(db, { now: NOW, policy })
    expect(r.replanned).toEqual([{ id: 'old-window', from: '2026-11-22T22:00:00.000Z', to: SATURDAY_6 }])
    const updates = calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toEqual({ scheduled_for: SATURDAY_6 })
    expect(updates[0].filters).toEqual(expect.arrayContaining([['eq:id', 'old-window'], ['eq:state', 'queued']]))
  })

  test("a letter off the template queues itself on Lawal's own approval of it, as the gateway's send-check clears it", async () => {
    const geelong = letter('Next Stop Comedy', 'Geelong', { subject: 'Complimentary listing in our Geelong events guide' })
    const own = { id: 'acq-test-02', content_hash: gatewayContentHash(gatewayFirstLetter(geelong)), policy_version: POLICY, by: 'lawal', authorised_send: true, at: '2026-11-20T12:21:12+1100' }
    const { db, calls } = fakeDb([{ id: 'geelong', template: 'acq_first v1', mail: geelong }])
    const r = await queueApprovedHeldLetters(db, { now: NOW, policy, letterApprovals: [own] })
    expect(r.queued).toEqual([{ id: 'geelong', at: SATURDAY_6, why: "Lawal's own approval acq-test-02 of 2026-11-20T12:21:12+1100" }])
    expect(calls.find((c) => c.op === 'update')?.payload).toEqual({ state: 'queued', scheduled_for: SATURDAY_6 })
  })

  // The source ask (the founder, 12:14 and 14:55 of 23 November 2026): read beside the acquisition letters, and queued
  // itself when it clears under source_ask v2 (Lawal, 24 November 2026; v1 is withdrawn, so a held v1 letter is not).
  test('the engine reads held source asks beside acquisition letters, and queues one that clears', async () => {
    expect(SELF_QUEUED_FIRST_LETTERS).toBe('comms_category.eq.ACQ,comms_subtype.eq.PERM-SOURCE')
    const d = SOURCE_DRAFTS[0]
    const { db, calls } = fakeDb([{ id: 'source', template: 'source_ask v2', mail: { template: 'source_ask v2', subject: d.subject ?? '', body: d.body, to: d.address } }])
    const r = await queueApprovedHeldLetters(db, { now: NOW, policy })
    expect(r.queued).toEqual([expect.objectContaining({ id: 'source', at: SATURDAY_6, why: expect.stringContaining('standing approval of source_ask v2') })])
    const old = SOURCE_DRAFTS_V1[0]
    const held = fakeDb([{ id: 'source-v1', template: 'source_ask v1', mail: { template: 'source_ask v1', subject: old.subject ?? '', body: old.body, to: old.address } }])
    expect((await queueApprovedHeldLetters(held.db, { now: NOW, policy })).queued).toEqual([])
    const read = calls.find((c) => c.table === 'outreach_touches' && c.op === 'select' && c.filters.some(([k, v]) => k === 'eq:state' && v === 'held'))
    expect(read?.filters).toEqual(expect.arrayContaining([['eq:step', 1], ['or', SELF_QUEUED_FIRST_LETTERS]]))
  })
})

/*
 * THE SOURCE ASK, A STANDING TEMPLATE THE ENGINE SENDS (the founder, 23 November 2026, 12:14: "Apply the already-approved
 * communication workflow to routine source requests."; 14:55: "Just get my engine going, please: my outreach, my photo
 * permissions, everything my system should be doing."): source_ask v1 is in the gateway's record and its copy, so each
 * source ask, the template with only its fields filled, clears; a changed sentence does not.
 */
describe('the source ask, a standing template the engine sends', () => {
  const v1 = standingApprovals().find((a) => a.key === 'source_ask' && a.version === 1)
  const entry = standingApprovals().find((a) => a.key === 'source_ask' && a.version === 2)

  test("source_ask v2 is recorded on, with Lawal's words of 24 November, and is the code's template word for word", () => {
    expect(entry?.on).toBe(true)
    expect(entry?.words).toContain("Lock it in ... It is ready for the next day, for tomorrow's message.")
    expect(entry?.policy_version).toBe(POLICY)
    expect(entry?.subject).toBe(SOURCE_ASK_EMAIL.subject)
    expect(entry?.body).toBe(SOURCE_ASK_EMAIL.body)
  })

  test("source_ask v1 is withdrawn: recorded off with its reason, still the record of the letters sent, and none of them clears now", () => {
    expect(v1?.on).toBe(false)
    expect((v1 as (StandingApproval & { withdrawn?: string }) | undefined)?.withdrawn).toContain('include the events on [site]')
    expect(v1?.body).toBe(SOURCE_ASK_EMAIL_V1.body)
    for (const d of SOURCE_DRAFTS_V1) {
      expect(standingClear({ template: 'source_ask v1', subject: d.subject ?? '', body: d.body }, POLICY).reason, d.id).toBe(
        "the standing approval for source_ask v1 is off: it is switched on only with Lawal's own words quoted",
      )
    }
  })

  test('each source ask, the template with only its fields filled, clears under it', () => {
    expect(SOURCE_DRAFTS.length).toBeGreaterThan(0)
    for (const d of SOURCE_DRAFTS) {
      const r = standingClear({ template: 'source_ask v2', subject: d.subject ?? '', body: d.body }, POLICY)
      expect([d.id, r.cleared, r.reason]).toEqual([d.id, true, expect.stringContaining('standing approval of source_ask v2')])
    }
    // A version 1 letter named as version 2 does not clear: its words are not version 2's.
    const old = SOURCE_DRAFTS_V1[0]
    expect(standingClear({ template: 'source_ask v2', subject: old.subject ?? '', body: old.body }, POLICY).reason).toBe("the letter's body is not source_ask v2 with only its fields filled")
  })

  test('a changed sentence, an ask with no question, a subject off the template or a link with no token does not clear', () => {
    const d = SOURCE_DRAFTS[0]
    const clear = (subject: string, body: string) => standingClear({ template: 'source_ask v2', subject, body }, POLICY).cleared
    expect(clear(d.subject ?? '', d.body)).toBe(true)
    expect(clear(d.subject ?? '', d.body.replace('with a direct link to its page', 'with a link to its page'))).toBe(false)
    expect(clear(d.subject ?? '', d.body.replace('?\n\nKind regards,', '.\n\nKind regards,'))).toBe(false)
    expect(clear(`${d.subject} today`, d.body)).toBe(false)
    expect(clear(d.subject ?? '', d.body.replace(SOURCE_LINK_ID, 'not-a-token'))).toBe(false)
  })

  test("a source ask's own approval is hashed as the gateway is given it, from hello@", () => {
    const d = SOURCE_DRAFTS[0]
    expect(gatewayFirstLetter({ subject: d.subject ?? '', body: d.body, to: d.address, category: 'PERM' }).from).toBe(HELLO_MAILBOX)
    expect(gatewayFirstLetter({ subject: d.subject ?? '', body: d.body, to: d.address }).from).not.toBe(HELLO_MAILBOX)
  })
})

/*
 * A LETTER'S OWN APPROVAL FIRST, AS THE GATEWAY'S SEND-CHECK READS IT (train AM): each of the seven held first letters
 * carries Lawal's own approval of 12.21 pm on 20 November (C:\dev\comms-gateway\state\approval-acq20-0N.json); three are
 * not on the standing template, so without this path they would wait though he approved them.
 */
describe("a letter's own approval, by the gateway's own hash", () => {
  test("the hash is Python's json.dumps form byte for byte (a vector computed by the gateway's own chash)", () => {
    const msg = { body: 'Hi Caf\u00e9 team,\nWe\u2019d be happy.', category: 'first_contact', channel: 'email', from: 'lawal@eventlinqs.com', greeting_name: 'Caf\u00e9 team', subject: 'S', thread_ref: null, to: null }
    expect(gatewayContentHash(msg)).toBe('79a53346dadb89fb')
  })

  test("on this machine: every approved letter's own file hashes to its approval, and the copy is the gateway's record", () => {
    const dir = 'C:\\dev\\EVIDENCE\\EL-20NOV\\acq\\letters-today'
    const state = 'C:\\dev\\comms-gateway\\state'
    if (!existsSync(dir) || !existsSync(state)) return
    const ids = ['01', '02', '03', '04', '05', '06', '07'].map((n) => `acq20-${n}`)
    for (const id of ids) {
      const m = JSON.parse(readFileSync(`${dir}\\${id}.json`, 'utf8')) as Record<string, unknown>
      const ap = JSON.parse(readFileSync(`${state}\\approval-${id}.json`, 'utf8')) as LetterApproval
      expect([id, gatewayContentHash(m)]).toEqual([id, ap.content_hash])
      const to = Array.isArray(m.to) ? String(m.to[0]) : null
      expect([id, gatewayContentHash(gatewayFirstLetter({ subject: String(m.subject), body: String(m.body), to }))]).toEqual([id, ap.content_hash])
      expect(letterApprovals().find((a) => a.id === id)).toEqual(ap)
    }
  })

  const approvalOf = (l: { subject: string; body: string; to: string | null }, extra: Partial<LetterApproval> = {}): LetterApproval => ({
    id: 'acq-test-01',
    content_hash: gatewayContentHash(gatewayFirstLetter(l)),
    policy_version: POLICY,
    by: 'lawal',
    authorised_send: true,
    at: '2026-11-20T12:21:09+1100',
    ...extra,
  })

  test('a letter off the standing template clears on its own approval; none means the standing approval decides', () => {
    const geelong = letter('Next Stop Comedy', 'Geelong', { subject: 'Complimentary listing in our Geelong events guide' })
    expect(ownApprovalClear(geelong, POLICY, [approvalOf(geelong)])).toEqual({ cleared: true, reason: "Lawal's own approval acq-test-01 of 2026-11-20T12:21:09+1100" })
    expect(ownApprovalClear(geelong, POLICY, [])).toBeNull()
  })

  test('its own approval alone decides: another policy, a draft only or anyone else refuses, never falling back', () => {
    const l = letter('Bendigo Symphony Orchestra', 'Bendigo')
    expect(ownApprovalClear(l, POLICY, [approvalOf(l, { policy_version: 'ffffffffffffffff' })])?.cleared).toBe(false)
    expect(ownApprovalClear(l, POLICY, [approvalOf(l, { authorised_send: false })])?.reason).toBe('approved as a draft only; sending not authorised')
    expect(ownApprovalClear(l, POLICY, [approvalOf(l, { by: 'someone' })])?.cleared).toBe(false)
    expect(ownApprovalClear({ ...l, body: l.body.replace('your next event', 'your next show') }, POLICY, [approvalOf(l)])).toBeNull()
  })
})


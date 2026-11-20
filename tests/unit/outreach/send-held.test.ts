import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * TRAIN AK, SEND AND SEND ALL CLEARED (the PM's 12:40 and 12:47 of 20 November 2026; ak\leaders-send.md). The press
 * uses production's own checks and the sender's one path; every refusal is drilled here: a non-founder, words changed
 * after review, a sender refusal (the letter goes back to held), outside business hours; Send all carries on past one
 * refusal at one letter every 20 seconds.
 */
const calls: string[] = []
let senderAnswer: { sent: string[]; refused: { id: string; reason: string }[]; failed: { id: string; reason: string }[]; outsideHours: number; note?: string } = {
  sent: [],
  refused: [],
  failed: [],
  outsideHours: 0,
}
let approval: string[] = []
vi.mock('@/lib/outreach/daily-queue', () => ({ readTouchVoice: async (_db: unknown, id: string) => (id === 'gone' ? null : { body: 'Hi team,', to: ['a@b.au'] }) }))
vi.mock('@/lib/outreach/crm', () => ({ confirmPageChecked: async () => (calls.push('checked'), { state: 'done', value: { id: 'x' } }) }))
vi.mock('@/lib/outreach/sender', () => ({ runOutreachSender: async (_db: unknown, deps: { only?: string[] }) => (calls.push(`sender:${(deps.only ?? []).join(',')}`), senderAnswer) }))
vi.mock('@/lib/outreach/voice-gate', () => ({ approvalProblems: () => approval, readVoicePolicy: () => ({ version: '0123456789abcdef' }) }))

type Row = { state: string; step: number; comms_category: string; internet_message_id?: string; sent_at?: string }
function fakeDb(rows: Record<string, Row>) {
  const updates: { id: string; to: Record<string, unknown>; from: string | null }[] = []
  const db = {
    from: () => {
      let id = ''
      let wantState: string | null = null
      let change: Record<string, unknown> | null = null
      const q = {
        select: () => q,
        update: (c: Record<string, unknown>) => ((change = c), q),
        eq: (k: string, v: string) => {
          if (k === 'id') id = v
          if (k === 'state') wantState = v
          return q
        },
        maybeSingle: async () => {
          const row = rows[id]
          if (change) {
            if (!row || (wantState && row.state !== wantState)) return { data: null, error: null }
            updates.push({ id, to: change, from: wantState })
            Object.assign(row, change)
            return { data: { id }, error: null }
          }
          return { data: row ?? null, error: null }
        },
        then: (ok: (v: unknown) => unknown) => {
          const row = rows[id]
          if (change && row && (!wantState || row.state === wantState)) {
            updates.push({ id, to: change, from: wantState })
            Object.assign(row, change)
          }
          return Promise.resolve({ data: null, error: null }).then(ok)
        },
      }
      return q
    },
  }
  return { db: db as never, updates }
}
const base = { contentHash: '0123456789abcdef', policyVersion: '0123456789abcdef', by: 'u1', now: new Date('2026-11-20T03:00:00Z'), origin: 'https://www.eventlinqs.com.au', graph: null }

beforeEach(() => {
  calls.length = 0
  approval = []
  senderAnswer = { sent: [], refused: [], failed: [], outsideHours: 0 }
})

describe('Send on a held first letter', () => {
  it('refuses anyone but the founder, before anything is read', async () => {
    const { sendHeldFirstLetter } = await import('@/lib/outreach/send-held')
    const { db, updates } = fakeDb({ t1: { state: 'held', step: 1, comms_category: 'ACQ' } })
    expect(await sendHeldFirstLetter(db, { ...base, touchId: 't1', byFounder: false })).toEqual({ state: 'refused', touchId: 't1', reason: 'only Lawal sends a first letter' })
    expect(updates).toEqual([])
    expect(calls).toEqual([])
  })

  it('refuses words changed after review: nothing is checked, queued or sent', async () => {
    const { sendHeldFirstLetter } = await import('@/lib/outreach/send-held')
    approval = ['changed after approval: approve the new wording']
    const { db, updates } = fakeDb({ t1: { state: 'held', step: 1, comms_category: 'ACQ' } })
    expect(await sendHeldFirstLetter(db, { ...base, touchId: 't1', byFounder: true })).toMatchObject({ state: 'refused', reason: 'changed after approval: approve the new wording' })
    expect(updates).toEqual([])
    expect(calls).toEqual([])
  })

  it('refuses anything but a held ACQ first letter', async () => {
    const { sendHeldFirstLetter } = await import('@/lib/outreach/send-held')
    const { db } = fakeDb({ t2: { state: 'held', step: 2, comms_category: 'ACQ' } })
    expect(await sendHeldFirstLetter(db, { ...base, touchId: 't2', byFounder: true })).toMatchObject({ state: 'refused', reason: 'it is not a held first letter' })
  })

  it('sends through the sender for that letter only, after the page check, and shows its receipt', async () => {
    const { sendHeldFirstLetter } = await import('@/lib/outreach/send-held')
    const rows = { t1: { state: 'held', step: 1, comms_category: 'ACQ' } as Row }
    const { db, updates } = fakeDb(rows)
    senderAnswer = { ...senderAnswer, sent: ['t1'] }
    const answer = sendHeldFirstLetter(db, { ...base, touchId: 't1', byFounder: true })
    // The sender marks it sent with our Message-ID (as sender.ts does); the receipt is read back from the row.
    const result = await answer.then((a) => a)
    expect(calls).toEqual(['checked', 'sender:t1'])
    expect(updates[0]).toMatchObject({ id: 't1', from: 'held', to: { state: 'queued' } })
    expect(result.state).toBe('sent')
  })

  it('a letter the sender refuses goes back to held at once, with the reason', async () => {
    const { sendHeldFirstLetter } = await import('@/lib/outreach/send-held')
    const rows = { t1: { state: 'held', step: 1, comms_category: 'ACQ' } as Row }
    const { db } = fakeDb(rows)
    senderAnswer = { ...senderAnswer, refused: [{ id: 't1', reason: 'already written: a message to this contact went earlier' }] }
    expect(await sendHeldFirstLetter(db, { ...base, touchId: 't1', byFounder: true })).toEqual({ state: 'refused', touchId: 't1', reason: 'already written: a message to this contact went earlier' })
    expect(rows.t1.state).toBe('held')
  })

  it('outside business hours it is not sent and goes back to held', async () => {
    const { sendHeldFirstLetter } = await import('@/lib/outreach/send-held')
    const rows = { t1: { state: 'held', step: 1, comms_category: 'ACQ' } as Row }
    const { db } = fakeDb(rows)
    senderAnswer = { ...senderAnswer, outsideHours: 1 }
    expect(await sendHeldFirstLetter(db, { ...base, touchId: 't1', byFounder: true })).toMatchObject({ state: 'refused', reason: /outside business hours/ })
    expect(rows.t1.state).toBe('held')
  })
})

describe('Send all cleared', () => {
  it('one at a time, one every 20 seconds, and one refusal never stops the others', async () => {
    const { sendAllCleared, SEND_ALL_GAP_MS } = await import('@/lib/outreach/send-held')
    const rows = { a: { state: 'held', step: 1, comms_category: 'ACQ' } as Row, b: { state: 'sent', step: 1, comms_category: 'ACQ' } as Row, c: { state: 'held', step: 1, comms_category: 'ACQ' } as Row }
    const { db } = fakeDb(rows)
    senderAnswer = { ...senderAnswer, sent: ['a', 'c'] }
    const waits: number[] = []
    const answers = await sendAllCleared(
      db,
      ['a', 'b', 'c'].map((touchId) => ({ touchId, contentHash: base.contentHash, policyVersion: base.policyVersion })),
      { byFounder: true, by: 'u1', origin: base.origin, graph: null },
      { now: () => base.now, wait: async (ms) => void waits.push(ms) },
    )
    expect(SEND_ALL_GAP_MS).toBe(20_000)
    expect(waits).toEqual([20_000, 20_000])
    expect(answers.map((a) => a.state)).toEqual(['sent', 'refused', 'sent'])
  })
})

describe('the press is wired as the leaders and the law say', () => {
  const actions = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/acquisition/actions.ts'), 'utf8').replace(/\r\n/g, '\n')
  const item = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/acquisition/daily-queue-item.tsx'), 'utf8').replace(/\r\n/g, '\n')
  it('only the founder presses Send or Send all, each audited', () => {
    for (const fn of ['sendHeldAction', 'sendAllClearedAction']) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}(`))
      expect(body.slice(0, 600)).toContain("if (session.admin.role !== 'super_admin') go('Only Lawal sends a first letter.')")
    }
    expect(actions).toContain("action: 'admin.outreach.send'")
    expect(actions).toContain("action: 'admin.outreach.send_all'")
  })
  it("a first letter's Open in Outlook and Sent stay behind their flag (law 30)", async () => {
    const { FIRST_LETTER_MANUAL_ON } = await import('@/lib/outreach/first-letter-flags')
    expect(FIRST_LETTER_MANUAL_ON).toBe(false)
    expect(item).toMatch(/if \(firstLetter && !FIRST_LETTER_MANUAL_ON && sendAction\) \{/)
  })
})

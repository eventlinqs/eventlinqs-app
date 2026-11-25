import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { messageNext, nextActionsLine, postNext, replyNext } from '@/lib/ops/next-actions'

/*
 * EVERY ACTIVE RECORD HAS A NEXT ACTION (Lawal's founder directive of 26 November 2026, items H and I): each active
 * message, reply waiting on a person and scheduled post is given its owner, next action and time; one with none, or past
 * its time, is listed in the 08:00 report. The case behind it, read on production at 00:39 on 26 November: two ACQ first
 * letters held since 20 and 21 November on the PM's order of 22 November, with no decision time, listed nowhere.
 */

const NOW = new Date('2026-11-25T20:00:00Z') // Thursday 26 November 2026, 07:00 in Melbourne
const msg = (over: Partial<Parameters<typeof messageNext>[0]> = {}) => ({ id: '371f84c5-0000', state: 'held', step: 1, subtype: 'ACQ-FIRST', heldBecause: [] as string[], draftedAt: '2026-11-25T10:00:00Z', scheduledFor: null, ...over })

describe('a message', () => {
  it("held on the PM's order past a day, with no decision time, is a fault, with its reason", () => {
    const r = messageNext(msg({ draftedAt: '2026-11-19T22:00:00Z', heldBecause: ["held on the PM's order of 00:41, 22 November 2026: the gateway's send-check refused it"] }), NOW)
    expect(r).toMatchObject({ owner: 'the PM', next: "the PM's decision" })
    expect(r.fault).toMatch(/^held on the PM's order since 2026-11-19 with no decision time: held on the PM's order of 00:41/)
  })

  it('held for a rule past a day is a fault (nothing drafts it again); inside the day it is on its way', () => {
    expect(messageNext(msg({ draftedAt: '2026-11-24T10:00:00Z', heldBecause: ['a field could not be filled from verified facts: [photo source]'] }), NOW).fault).toMatch(/and nothing drafts it again$/)
    expect(messageNext(msg({ heldBecause: ['a field could not be filled'] }), NOW).fault).toBeNull()
  })

  it('a clean held first letter of the self queue is its; another waits on the daily queue; each a fault past a day', () => {
    expect(messageNext(msg(), NOW)).toMatchObject({ owner: 'the self queue', fault: null })
    expect(messageNext(msg({ subtype: 'PERM-IMAGE' }), NOW)).toMatchObject({ owner: 'the daily queue', fault: null })
    expect(messageNext(msg({ draftedAt: '2026-11-23T10:00:00Z' }), NOW).fault).toMatch(/the self queue has not queued it/)
  })

  it('queued is the sender\'s until its time; an hour past it, a fault; a failed send is always one', () => {
    expect(messageNext(msg({ state: 'queued', scheduledFor: '2026-12-01T20:00:00Z' }), NOW)).toMatchObject({ owner: 'the sender', at: '2026-12-01T20:00:00Z', fault: null })
    expect(messageNext(msg({ state: 'queued', scheduledFor: '2026-11-25T18:30:00Z' }), NOW).fault).toMatch(/waiting past its time$/)
    expect(messageNext(msg({ state: 'failed' }), NOW).fault).toBe('its send failed and nothing has queued it again or set it aside')
  })
})

describe('a reply, a post, and the line', () => {
  it('a reply waiting on a person past four hours, and a post an hour past its time, are faults', () => {
    expect(replyNext({ id: 'r1', receivedAt: '2026-11-25T15:00:00Z' }, NOW).fault).toMatch(/^waiting on a person since/)
    expect(replyNext({ id: 'r1', receivedAt: '2026-11-25T18:00:00Z' }, NOW).fault).toBeNull()
    expect(postNext({ id: 'p1', goAt: '2026-11-25T18:00:00Z', platform: 'instagram' }, NOW).fault).toMatch(/and not published$/)
  })

  it('the line says the count, and every fault by kind, short id and why; all well says so', () => {
    const ok = [messageNext(msg({ state: 'queued', scheduledFor: '2026-12-01T20:00:00Z' }), NOW)]
    expect(nextActionsLine(ok)).toBe('1 active (1 messages, 0 replies waiting on a person, 0 posts scheduled); every one has its next action and its time.')
    const bad = [...ok, messageNext(msg({ state: 'failed', id: 'abcdef12-9999' }), NOW)]
    expect(nextActionsLine(bad)).toBe(
      '2 active (2 messages, 0 replies waiting on a person, 0 posts scheduled); 1 WITHOUT A NEXT ACTION OR PAST ITS TIME: message abcdef12: its send failed and nothing has queued it again or set it aside.',
    )
  })

  it('the 08:00 report reads it every morning, and a failed read is named in the line', () => {
    const route = readFileSync('src/app/api/cron/health-heartbeat/route.ts', 'utf8').replace(/\r\n/g, '\n')
    expect(route).toMatch(/const nextActions = await readNextActions\(db, now\)\.then\(nextActionsLine\)\.catch\(\(err: unknown\) => `not read: /)
    expect(route).toContain('answers, perContact, floor, nextActions })')
  })
})

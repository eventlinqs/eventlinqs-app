import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { planMoments, scheduleWindowOf, withStartingCalendar, type CadenceRule } from '@/lib/social/cadence'

/*
 * A PIECE GOES BEFORE ITS NIGHT STARTS (the PM's 22:08 of 17 November 2026, class 2: "a daily poster takes 22:25 local on
 * its own night's day, AFTER the night has started: Fine Lines & Wine (6 pm Wed 18) is set for 21:25 Wed; The Roy
 * Orbison Story (7:30 pm Thu 19) for 21:25 Thu; Caravanning (9 am Fri 20) for 09:25 Fri ... No piece posts in a slot after
 * its night starts"). The scheduler gave each piece the deadline of its soonest night's END; it is now its earliest
 * night's START.
 */
const rule = (format: 'feed' | 'story'): CadenceRule =>
  withStartingCalendar({ version: 1, gapHours: format === 'feed' ? 12 : 2, slots: [], basis: 'starting', learnedFrom: 0, floorPosts: 0, settleHours: 0, setAt: new Date('2026-11-01T00:00:00Z') }, format)

// Fine Lines & Wine, Archive Wine Bar, Geelong: Wednesday 18 November, 6 pm to midnight Melbourne (UTC+11).
const fineLines = { title: 'Fine Lines & Wine', start: Date.parse('2026-11-18T07:00:00Z'), end: Date.parse('2026-11-18T13:00:00Z') }

describe('scheduleWindowOf', () => {
  it("a piece's deadline is its earliest night's start, not its end", () => {
    const w = scheduleWindowOf('feed', [fineLines])
    expect(w.deadline?.toISOString()).toBe('2026-11-18T07:00:00.000Z')
    expect(w.first?.title).toBe('Fine Lines & Wine')
    expect(w.notBefore).toBeNull()
  })

  it('a story waits for its first night\'s day and still goes before the night starts', () => {
    const w = scheduleWindowOf('story', [fineLines])
    expect(w.notBefore?.toISOString()).toBe('2026-11-17T13:00:00.000Z') // midnight starting Wednesday in Melbourne
    expect(w.deadline?.toISOString()).toBe('2026-11-18T07:00:00.000Z')
  })

  it('no night with a start: no window', () => {
    expect(scheduleWindowOf('feed', [])).toEqual({ deadline: null, notBefore: null, first: null })
  })

  it("Fine Lines & Wine's poster, approved Wednesday morning, is never placed after 6 pm Wednesday", () => {
    const approvedAt = new Date('2026-11-17T22:00:00Z') // 9 am Wednesday
    const w = scheduleWindowOf('feed', [fineLines])
    const plan = planMoments([{ id: 'poster', format: 'feed', approvedAt, deadline: w.deadline, notBefore: w.notBefore }], { feed: rule('feed'), story: rule('story') }, { feed: [], story: [] }, approvedAt)
    const at = plan.moments.get('poster')
    expect(at).toBeDefined()
    expect(at!.getTime()).toBeLessThan(fineLines.start)
  })

  it('the scheduler takes its window from scheduleWindowOf, never from a night\'s end', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/social/store.ts'), 'utf8')
    const body = src.slice(src.indexOf('export async function scheduleApprovedPieces'), src.indexOf('/** What publishes a piece on a network'))
    expect(body).toMatch(/scheduleWindowOf\(/)
    expect(body).not.toMatch(/deadline: new Date\(soonest\.end\)/)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { piecePlainState } from '@/lib/social/post-state'

/*
 * A PIECE'S STATE IN PLAIN WORDS (the PM's 16:40 of 21 November 2026, AV (f)): planned, ready, scheduled, published
 * (provider confirmed), blocked (with why), failed (with why), expired; one mapping from the database's fields.
 */
const base = { state: 'approved' as const, postUrl: null, schedule: [], rejectedReason: null, momentDay: '2026-11-22', today: '2026-11-22' }
const row = (state: string, publishedRef: string | null, heldReason: string | null) => ({ state, publishedRef, heldReason, goAt: '2026-11-22T07:00:00Z' })

describe('piecePlainState', () => {
  it('planned and ready', () => {
    expect(piecePlainState({ ...base, state: 'drafted' }).state).toBe('planned')
    expect(piecePlainState(base)).toEqual({ state: 'ready', why: 'approved, waiting for its band' })
  })
  it('scheduled, and a submission waiting for the provider is not yet published', () => {
    expect(piecePlainState({ ...base, schedule: [row('scheduled', null, null)] }).state).toBe('scheduled')
    expect(piecePlainState({ ...base, schedule: [row('published', 'blotato:sub-1', null)] }).state).toBe('scheduled')
  })
  it('published only with the address the provider confirmed', () => {
    expect(piecePlainState({ ...base, schedule: [row('published', 'https://www.instagram.com/p/AbC123/', null)] })).toEqual({ state: 'published', why: 'published, confirmed by the provider: https://www.instagram.com/p/AbC123/' })
  })
  it('blocked by our rules, failed by an error, each with why', () => {
    const blocked = piecePlainState({ ...base, schedule: [row('held', null, 'Not scheduled: its next free band, Sun 22 Nov, 6:00 pm, is after Colours of Asia starts.')] })
    expect(blocked.state).toBe('blocked')
    expect(blocked.why).toMatch(/next free band/)
    expect(piecePlainState({ ...base, schedule: [row('held', null, 'Not published: Blotato could not publish: rate limited')] }).state).toBe('failed')
    expect(piecePlainState({ ...base, schedule: [row('held', null, 'Sent as blotato:abc; the database refused that reference: x')] }).state).toBe('failed')
    expect(piecePlainState({ ...base, state: 'rejected', rejectedReason: 'Pre-flight 2026-11-22: no band' })).toEqual({ state: 'blocked', why: 'rejected: Pre-flight 2026-11-22: no band' })
  })
  it('expired when its day passed', () => {
    expect(piecePlainState({ ...base, schedule: [row('held', null, 'Not published: its slot of 2026-11-21 passed before it could post; a missed day is never posted late (law 42)')] }).state).toBe('expired')
    expect(piecePlainState({ ...base, momentDay: '2026-11-21' }).state).toBe('expired')
  })
  it('the admin shows it at the head of every piece', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/social/page.tsx'), 'utf8')
    expect(page).toContain('data-plain-state={plain.state}')
    expect(page).toContain('{plain.why}')
  })
})

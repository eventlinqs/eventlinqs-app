/*
 * EVENT CREATION IS RATE LIMITED, AND THE LIMIT ACTUALLY REFUSES.
 *
 * Event creation had no limiter at all until 19 August 2026. It was found by an
 * audit, and an audit finding is a claim about source text, so this file is the
 * part that makes the claim behave: it drives the real `checkRateLimit` with the
 * real `event-create` numbers against a real counting store, and requires a
 * refusal on the thirty-first call.
 *
 * IT ALSO CHECKS THE BUCKET, which is the half that was wrong the first time. The
 * policy shipped saying "per organiser per hour" while the call site passed no
 * identifier, so `actionRateLimit` used its forwarded-IP default. A number without
 * the right bucket is not the limit anybody was told about.
 *
 * EVERY ASSERTION OF ABSENCE HERE CARRIES A CONTROL. "No refusal happened" and
 * "the harness cannot produce a refusal" print the same green tick, and this
 * project has been caught by that distinction more than once.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test, vi, beforeEach } from 'vitest'

/** A real counting store, standing in for Upstash. INCR and EXPIRE are all the limiter uses. */
const store = new Map<string, number>()
let clientEnabled = true
vi.mock('@/lib/redis/client', () => ({
  getRedisClient: () =>
    clientEnabled
      ? {
          incr: async (k: string) => { const n = (store.get(k) ?? 0) + 1; store.set(k, n); return n },
          expire: async () => 1,
        }
      : null,
}))

import { checkRateLimit } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'

const ACTIONS = resolve(process.cwd(), 'src/app/(dashboard)/dashboard/events/actions.ts')
const source = readFileSync(ACTIONS, 'utf8')

/** createEvent's body: from its declaration to the next top-level export. */
function createEventBody(text: string): string {
  const start = text.indexOf('export async function createEvent')
  expect(start, 'createEvent must exist in the events actions module').toBeGreaterThan(-1)
  const next = text.indexOf('\nexport ', start + 1)
  return text.slice(start, next === -1 ? text.length : next)
}

beforeEach(() => {
  store.clear()
  clientEnabled = true
})

describe('event-create policy', () => {
  test('the policy exists, is fail-closed, and is a per-hour cap', () => {
    const p = POLICIES['event-create']
    expect(p).toBeDefined()
    expect(p.failClosed).toBe(true)
    expect(p.windowSec).toBe(3600)
    expect(p.limit).toBeGreaterThan(0)
  })

  test('the (limit + 1)th create in the window is REFUSED', async () => {
    const p = POLICIES['event-create']
    const key = `${p.keyPrefix}:organiser-under-test`
    const verdicts: boolean[] = []
    for (let i = 0; i < p.limit + 1; i += 1) {
      const r = await checkRateLimit({ key, limit: p.limit, windowSec: p.windowSec, failClosed: p.failClosed })
      verdicts.push(r.ok)
    }
    expect(verdicts.slice(0, p.limit).every(Boolean), `the first ${p.limit} must all pass`).toBe(true)
    expect(verdicts[p.limit], `call ${p.limit + 1} must be refused`).toBe(false)
  })

  test('CONTROL: with no store configured the same run does NOT refuse, so the refusal above was the limiter', async () => {
    clientEnabled = false
    const p = POLICIES['event-create']
    const key = `${p.keyPrefix}:organiser-under-test`
    const verdicts: boolean[] = []
    for (let i = 0; i < p.limit + 1; i += 1) {
      const r = await checkRateLimit({ key, limit: p.limit, windowSec: p.windowSec, failClosed: p.failClosed })
      verdicts.push(r.ok)
    }
    // Not production, so an absent config allows. If this ever refuses, the test
    // above proves nothing: it would be measuring the harness.
    expect(verdicts.every(Boolean)).toBe(true)
  })

  test('CONTROL: a different bucket is not consumed by the first, so the key is really the bucket', async () => {
    const p = POLICIES['event-create']
    for (let i = 0; i < p.limit + 1; i += 1) {
      await checkRateLimit({ key: `${p.keyPrefix}:organiser-a`, limit: p.limit, windowSec: p.windowSec })
    }
    const other = await checkRateLimit({ key: `${p.keyPrefix}:organiser-b`, limit: p.limit, windowSec: p.windowSec })
    expect(other.ok, 'organiser B must be unaffected by organiser A exhausting their window').toBe(true)
  })
})

describe('createEvent wiring', () => {
  test('the limiter is keyed by the user, not by the address', () => {
    const body = createEventBody(source)
    expect(body).toMatch(/actionRateLimit\(\s*'event-create'\s*,\s*user\.id\s*\)/)
  })

  test('the limiter sits AFTER the auth check and BEFORE the first write', () => {
    const body = createEventBody(source)
    const auth = body.indexOf('auth.getUser()')
    const limit = body.indexOf("actionRateLimit('event-create'")
    const write = body.indexOf('.insert(')
    expect(auth, 'createEvent must resolve the user').toBeGreaterThan(-1)
    expect(limit, 'createEvent must call the limiter').toBeGreaterThan(-1)
    expect(write, 'createEvent must write something').toBeGreaterThan(-1)
    // After auth: an anonymous caller is refused as unauthenticated rather than
    // burning a real organiser's bucket. Before the write: a refusal must cost
    // nothing.
    expect(auth).toBeLessThan(limit)
    expect(limit).toBeLessThan(write)
  })

  test('CONTROL: the ordering check FAILS on a body where the limiter moved after the write', () => {
    // The same three positions, taken from a deliberately broken source, must
    // produce the opposite verdict. Without this, "the order is right" and "the
    // check cannot see the order" are the same green tick.
    const broken = `
      export async function createEvent() {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await admin.from('events').insert({})
        const rl = await actionRateLimit('event-create', user.id)
      }
    `
    const auth = broken.indexOf('auth.getUser()')
    const limit = broken.indexOf("actionRateLimit('event-create'")
    const write = broken.indexOf('.insert(')
    expect(auth).toBeGreaterThan(-1)
    // The check the real test relies on is `limit < write`. On this sample it must
    // be FALSE, which is what proves the check is capable of failing.
    expect(limit < write, 'the ordering check must NOT pass on a body where the limiter follows the write').toBe(false)
  })
})

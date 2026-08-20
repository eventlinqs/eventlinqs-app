/*
 * PAYOUTS-READ IS KEYED TO THE ORGANISATION, AND THE LIMIT ACTUALLY REFUSES.
 *
 * `payouts-read` shipped with a rationale reading "60/min per user" while all three
 * routes called `applyRateLimit` with no identifier override, so the real bucket was
 * the forwarded address. That is the same defect `event-create` carried: a number
 * without the right bucket is not the limit anybody was told about. Founder ruling
 * 19 August 2026 re-keyed it to the organisation, which meant moving the limiter
 * BELOW `resolveOrganiserScope` on all three routes, because the bucket cannot be
 * named until the scope names it.
 *
 * This file is the part that makes the claim behave. The parity script
 * (scripts/verify/payouts-read-parity.mjs) proves no caller-visible change; it
 * cannot prove the bucket, because a bucket is not visible in a response. That is
 * what this proves.
 *
 * EVERY ASSERTION OF ABSENCE CARRIES A CONTROL. "No refusal happened" and "the
 * harness cannot produce a refusal" print the same green tick, and this project has
 * been caught by that distinction twice.
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

const ROUTES = {
  list: 'src/app/api/payouts/list/route.ts',
  summary: 'src/app/api/payouts/summary/route.ts',
  refunds: 'src/app/api/payouts/refunds/route.ts',
} as const

type RouteName = keyof typeof ROUTES
const ROUTE_NAMES = Object.keys(ROUTES) as RouteName[]

const sources = Object.fromEntries(
  ROUTE_NAMES.map((name) => [name, readFileSync(resolve(process.cwd(), ROUTES[name]), 'utf8')]),
) as Record<RouteName, string>

beforeEach(() => {
  store.clear()
  clientEnabled = true
})

describe('payouts-read policy', () => {
  test('the policy exists and is a per-minute read cap', () => {
    const p = POLICIES['payouts-read']
    expect(p).toBeDefined()
    expect(p.windowSec).toBe(60)
    expect(p.limit).toBeGreaterThan(0)
  })

  test('it stays FAIL-OPEN, which is the recorded ruling for a read path with no metered spend', () => {
    // Pinned deliberately. If somebody makes this fail-closed, a missing Upstash
    // config stops every organiser dashboard from refreshing, which is a worse
    // outcome than the scraping this limit exists to slow.
    expect(POLICIES['payouts-read'].failClosed).toBeFalsy()
  })

  test('the rationale claims the ORGANISATION bucket, not a per-user or per-address one', () => {
    // The original defect was prose and code disagreeing. This asserts the prose
    // half, so that the two can be checked against each other at all.
    const r = POLICIES['payouts-read'].rationale
    expect(r).toMatch(/organisationId/)
    expect(r).toMatch(/PER ORGANISATION/)
  })

  test('the (limit + 1)th read in the window is REFUSED', async () => {
    const p = POLICIES['payouts-read']
    const key = `${p.keyPrefix}:org-under-test`
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
    const p = POLICIES['payouts-read']
    const key = `${p.keyPrefix}:org-under-test`
    const verdicts: boolean[] = []
    for (let i = 0; i < p.limit + 1; i += 1) {
      const r = await checkRateLimit({ key, limit: p.limit, windowSec: p.windowSec, failClosed: p.failClosed })
      verdicts.push(r.ok)
    }
    expect(verdicts.every(Boolean)).toBe(true)
  })

  test('CONTROL: one organisation exhausting its window does not touch another', async () => {
    // This is the whole point of the re-key. Under the old address bucket, two
    // organisers behind one carrier NAT shared a single window of sixty; under this
    // one they do not.
    const p = POLICIES['payouts-read']
    for (let i = 0; i < p.limit + 1; i += 1) {
      await checkRateLimit({ key: `${p.keyPrefix}:org-a`, limit: p.limit, windowSec: p.windowSec })
    }
    const other = await checkRateLimit({ key: `${p.keyPrefix}:org-b`, limit: p.limit, windowSec: p.windowSec })
    expect(other.ok, 'organisation B must be unaffected by organisation A exhausting its window').toBe(true)
  })
})

describe('the three route call sites', () => {
  test.each(ROUTE_NAMES)('%s passes the organisation id as the identifier override', (name) => {
    expect(sources[name]).toMatch(
      /applyRateLimit\(\s*'payouts-read'\s*,\s*request\s*,\s*scope\.org\.organisationId\s*\)/,
    )
  })

  test.each(ROUTE_NAMES)('%s calls the limiter AFTER the scope resolves', (name) => {
    const src = sources[name]
    const scope = src.indexOf('resolveOrganiserScope(')
    const limit = src.indexOf("applyRateLimit('payouts-read'")
    expect(scope, 'the route must resolve the scope').toBeGreaterThan(-1)
    expect(limit, 'the route must call the limiter').toBeGreaterThan(-1)
    // After the scope: the bucket cannot be named before it. This is the ordering
    // the founder ruled on.
    expect(limit).toBeGreaterThan(scope)
  })

  test.each(ROUTE_NAMES)('%s no longer calls the limiter with no identifier, which was the address bucket', (name) => {
    // The exact old call. If this reappears anywhere in the file, the bucket has
    // silently gone back to the forwarded address.
    expect(sources[name]).not.toMatch(/applyRateLimit\(\s*'payouts-read'\s*,\s*request\s*\)/)
  })

  test('CONTROL: the ordering check FAILS on a body where the limiter precedes the scope', () => {
    // Without this, "the order is right" and "the check cannot see the order" are
    // the same green tick. The same two positions, taken from a deliberately broken
    // source, must produce the opposite verdict.
    const broken = [
      'export async function GET(request: Request) {',
      "  const blocked = await applyRateLimit('payouts-read', request)",
      '  if (blocked) return blocked',
      '  const scope = await resolveOrganiserScope(undefined)',
      '}',
    ].join('\n')
    const scope = broken.indexOf('resolveOrganiserScope(')
    const limit = broken.indexOf("applyRateLimit('payouts-read'")
    expect(scope).toBeGreaterThan(-1)
    expect(limit).toBeGreaterThan(-1)
    expect(limit > scope, 'the ordering check must NOT pass on a body where the limiter precedes the scope').toBe(false)
  })

  test('CONTROL: the identifier check FAILS on the old two-argument call', () => {
    const broken = "  const blocked = await applyRateLimit('payouts-read', request)"
    expect(/applyRateLimit\(\s*'payouts-read'\s*,\s*request\s*,\s*scope\.org\.organisationId\s*\)/.test(broken)).toBe(false)
    expect(/applyRateLimit\(\s*'payouts-read'\s*,\s*request\s*\)/.test(broken)).toBe(true)
  })
})

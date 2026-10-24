import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { ReadRows } from '@/lib/connect/bookedproof/assemble'

/**
 * E51, THE ENDPOINT'S DOOR (the contract's sections 2 and 10): 503 while the
 * secret is unset, then the signature before anything is parsed or read, then
 * the fail-closed limit, then the body. The rows are mocked here; the TEST
 * proof (scripts/verify/bookedproof-organiser-read-proof.mjs) reads real ones.
 */

const SECRET = '06677f823493f4f6355c0c636489e7a0eca2e77ae0d54b1f3e1bfec887b0db3b'
const TIMESTAMP = '1792738800'
const BODY = '{"emails":["bp-vector-organiser@bookedproof.test"],"pages":[],"since":null}'
const SIGNATURE = 'v1=244e6db4d85690359509c76e76ad6459ff6d0a728db49202277d9fdd936e9894'

const applyRateLimit = vi.fn(async (_policy: string, _request: Request, _id?: string): Promise<Response | null> => null)
const readOrganiserRows = vi.fn(async (): Promise<ReadRows> => ({
  organisationsByEmail: new Map(),
  listingBySlug: new Map(),
  organisations: new Map(),
  events: [],
  links: [],
  conversions: [],
  orders: new Map(),
  facts: { tickets: new Map(), refundedAt: new Map(), buyersFirst: new Set() },
  tierCurrency: new Map(),
}))

vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: (...a: [string, Request, string?]) => applyRateLimit(...a),
}))
vi.mock('@/lib/connect/bookedproof/read', () => ({
  readOrganiserRows: () => readOrganiserRows(),
}))
vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))

const { POST } = await import('@/app/api/connect/bookedproof/organisers/route')

const post = (body: string, headers: Record<string, string> = { 'x-eventlinqs-timestamp': TIMESTAMP, 'x-eventlinqs-signature': SIGNATURE }) =>
  POST(new NextRequest('https://www.eventlinqs.com.au/api/connect/bookedproof/organisers', { method: 'POST', headers, body }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T07:00:00Z'))
  process.env.BOOKEDPROOF_CONNECTOR_SECRET = SECRET
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.eventlinqs.com.au'
  applyRateLimit.mockClear()
  readOrganiserRows.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.BOOKEDPROOF_CONNECTOR_SECRET
})

describe('the door', () => {
  test('the vector request is answered 200, uncached, one entry per address', async () => {
    const res = await post(BODY)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(await res.json()).toEqual({
      version: 1,
      generated_at: '2026-10-23T07:00:00.000Z',
      organisers: [{ email: 'bp-vector-organiser@bookedproof.test', found: false }],
    })
    expect(applyRateLimit).toHaveBeenCalledWith('bookedproof-organiser-read', expect.anything(), 'bookedproof')
  })

  test('503 not-configured while the secret is unset, and nothing is read', async () => {
    delete process.env.BOOKEDPROOF_CONNECTOR_SECRET
    const res = await post(BODY)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'not-configured' })
    expect(readOrganiserRows).not.toHaveBeenCalled()
  })

  test('401 with its one word: unsigned, stale, bad-signature; nothing read, no limit spent', async () => {
    expect(await (await post(BODY, {})).json()).toEqual({ error: 'unsigned' })
    vi.setSystemTime(new Date('2026-10-23T07:05:01Z'))
    const stale = await post(BODY)
    expect([stale.status, await stale.json()]).toEqual([401, { error: 'stale' }])
    vi.setSystemTime(new Date('2026-10-23T07:00:00Z'))
    const altered = await post(BODY.replace('organiser@', 'organisers@'))
    expect([altered.status, await altered.json()]).toEqual([401, { error: 'bad-signature' }])
    expect(readOrganiserRows).not.toHaveBeenCalled()
    expect(applyRateLimit).not.toHaveBeenCalled()
  })

  test('the limiter refusing (full or unreachable) is the answer', async () => {
    applyRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }))
    const res = await post(BODY)
    expect(res.status).toBe(429)
    expect(readOrganiserRows).not.toHaveBeenCalled()
  })

  test('a signed body that breaks the request rules is 400 with the reason', async () => {
    const { signatureFor } = await import('@/lib/connect/bookedproof/signature')
    const tooMany = JSON.stringify({ emails: Array.from({ length: 101 }, (_, i) => `o${i}@example.com`) })
    const res = await post(tooMany, { 'x-eventlinqs-timestamp': TIMESTAMP, 'x-eventlinqs-signature': signatureFor(SECRET, TIMESTAMP, tooMany) })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request', reason: 'emails must be an array of 1 to 100 addresses' })
    const notJson = '{"emails":'
    const res2 = await post(notJson, { 'x-eventlinqs-timestamp': TIMESTAMP, 'x-eventlinqs-signature': signatureFor(SECRET, TIMESTAMP, notJson) })
    expect([res2.status, await res2.json()]).toEqual([400, { error: 'bad-request', reason: 'the body is not JSON' }])
  })

  test('a body over 64 KB is refused before it is hashed', async () => {
    const res = await post('x'.repeat(64 * 1024 + 1))
    expect([res.status, await res.json()]).toEqual([413, { error: 'too-large' }])
  })

  test('a read that fails is 500 read-failed, never a partial answer', async () => {
    readOrganiserRows.mockRejectedValueOnce(new Error('organisations by contact address could not be read in full'))
    const res = await post(BODY)
    expect([res.status, await res.json()]).toEqual([500, { error: 'read-failed' }])
  })
})

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { signatureFor } from '@/lib/connect/bookedproof/signature'

/**
 * T3, THE PLATFORM READ'S DOOR (the project manager's 22:35 (3) and 22:45 (3)
 * of 26 October 2026): an unknown scope is 404; each scope answers 503 until
 * its OWN secret is set; a request signed under one scope's secret never reads
 * another; then the fail-closed limit, then the body; a 200 is logged with its
 * row count. The rows are mocked here; the TEST proof reads real ones.
 */

const SECRETS = {
  organisations: 'a'.repeat(64),
  events: 'b'.repeat(64),
  buyers: 'c'.repeat(64),
  ledger: 'd'.repeat(64),
}
const ENV = {
  organisations: 'BOOKEDPROOF_PLATFORM_SECRET_ORGANISATIONS',
  events: 'BOOKEDPROOF_PLATFORM_SECRET_EVENTS',
  buyers: 'BOOKEDPROOF_PLATFORM_SECRET_BUYERS',
  ledger: 'BOOKEDPROOF_PLATFORM_SECRET_LEDGER',
} as const
const NOW = new Date('2026-10-27T01:00:00Z')
const TIMESTAMP = String(Math.floor(NOW.getTime() / 1000))

const applyRateLimit = vi.fn(async (_policy: string, _request: Request, _id?: string): Promise<Response | null> => null)
const readPlatformPage = vi.fn(async (_scope: string, _req: unknown) => ({ rows: [{ id: 'o1' }, { id: 'o2' }], next: null as string | null }))
const logPlatformRead = vi.fn(async (_entry: unknown) => ({ recorded: true }))

vi.mock('@/lib/rate-limit/middleware', () => ({
  applyRateLimit: (...a: [string, Request, string?]) => applyRateLimit(...a),
}))
vi.mock('@/lib/connect/bookedproof/platform-read', () => ({
  readPlatformPage: (scope: string, req: unknown) => readPlatformPage(scope, req),
}))
vi.mock('@/lib/connect/bookedproof/platform-log', () => ({
  logPlatformRead: (entry: unknown) => logPlatformRead(entry),
}))
vi.mock('@/lib/observability/sentry', () => ({ captureException: vi.fn() }))

const { POST } = await import('@/app/api/connect/bookedproof/platform/[scope]/route')

function post(scope: string, body: string, secret: string | null = SECRETS[scope as keyof typeof SECRETS] ?? null) {
  const headers: Record<string, string> = secret
    ? { 'x-eventlinqs-timestamp': TIMESTAMP, 'x-eventlinqs-signature': signatureFor(secret, TIMESTAMP, body) }
    : {}
  return POST(new NextRequest(`https://www.eventlinqs.com.au/api/connect/bookedproof/platform/${scope}`, { method: 'POST', headers, body }), {
    params: Promise.resolve({ scope }),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  for (const s of Object.keys(ENV) as (keyof typeof ENV)[]) process.env[ENV[s]] = SECRETS[s]
  applyRateLimit.mockClear()
  readPlatformPage.mockClear()
  logPlatformRead.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
  for (const name of Object.values(ENV)) delete process.env[name]
})

describe('the platform read door', () => {
  test('a signed page of a scope is answered 200, uncached, and logged with its row count', async () => {
    const res = await post('ledger', '{"after":null,"limit":2}')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(await res.json()).toEqual({ scope: 'ledger', rows: [{ id: 'o1' }, { id: 'o2' }], next: null, read_at: NOW.toISOString() })
    expect(readPlatformPage).toHaveBeenCalledWith('ledger', { after: null, limit: 2 })
    expect(logPlatformRead).toHaveBeenCalledWith({ scope: 'ledger', rows: 2, after: null, next: null })
    expect(applyRateLimit).toHaveBeenCalledWith('bookedproof-platform-read', expect.anything(), 'bookedproof')
  })

  test('an unknown scope is 404 and reads nothing', async () => {
    const res = await post('profiles', '{}', SECRETS.ledger)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'unknown-scope' })
    expect(readPlatformPage).not.toHaveBeenCalled()
  })

  test('a scope whose own secret is unset answers 503 while every other scope still answers', async () => {
    delete process.env[ENV.buyers]
    expect((await post('buyers', '{}', SECRETS.buyers)).status).toBe(503)
    expect((await post('events', '{}')).status).toBe(200)
    expect(readPlatformPage).toHaveBeenCalledTimes(1)
  })

  test('a request signed under another scope\'s secret is refused: one secret never reads another scope', async () => {
    const res = await post('buyers', '{}', SECRETS.ledger)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'bad-signature' })
    expect(readPlatformPage).not.toHaveBeenCalled()
    expect(applyRateLimit).not.toHaveBeenCalled()
  })

  test('an unsigned request is refused before the limit or the body', async () => {
    const res = await post('events', '{}', null)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unsigned' })
    expect(applyRateLimit).not.toHaveBeenCalled()
  })

  test('a body over 4 KB is refused before it is hashed', async () => {
    const res = await post('events', JSON.stringify({ after: 'x'.repeat(5000) }))
    expect(res.status).toBe(413)
  })

  test('a body that asks for more than a page is refused with its reason', async () => {
    const res = await post('events', '{"limit":501}')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'bad-request', reason: 'limit must be a whole number from 1 to 500' })
    expect(readPlatformPage).not.toHaveBeenCalled()
  })

  test('the limiter refusing ends the request before any read', async () => {
    applyRateLimit.mockResolvedValueOnce(new Response('{}', { status: 429 }))
    const res = await post('organisations', '{}')
    expect(res.status).toBe(429)
    expect(readPlatformPage).not.toHaveBeenCalled()
  })

  test('a read that fails answers 500 and logs nothing as read', async () => {
    readPlatformPage.mockRejectedValueOnce(new Error('the ledger could not be read: boom'))
    const res = await post('ledger', '{}')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'read-failed' })
    expect(logPlatformRead).not.toHaveBeenCalled()
  })
})

import { describe, expect, test, vi } from 'vitest'

import {
  retryTransport,
  getJson,
  callRpc,
  couldNotLook,
  ATTEMPTS,
} from '../../../scripts/guards/lib/db-read.mjs'

/**
 * A BUILD GUARD MUST KNOW WHETHER IT FAILED TO LOOK OR LOOKED AND DISLIKED WHAT
 * IT SAW.
 *
 * The door under test exists because that distinction was not being drawn, and
 * the cost was not flakiness alone. `event-lifecycle-installed` printed
 *
 *     event_lifecycle_guards() could not be asked (fetch failed);
 *     apply 20260906000001_... and 20260906000002_... to this project
 *
 * on a project where both migrations had been applied for a week. A dropped
 * packet was reported as a missing migration.
 *
 * So these tests are mostly about classification, not about retrying: the
 * retry is the cheap half. The half that matters is that a transport failure
 * and an answer can never be confused, and that a real answer is not retried
 * into a five second pause for no reason.
 *
 * The backoff is stubbed to zero throughout, because a test that takes 5.6
 * seconds to prove a retry happened is a test someone eventually skips.
 */
const NOW = { attempts: ATTEMPTS, backoff: [0, 0, 0] }

describe('retryTransport: what is retried and what is not', () => {
  test('a transport failure is retried to the bound and reported as transport', async () => {
    const attempt = vi.fn(async () => ({ ok: false, kind: 'transport', detail: 'fetch failed' }))
    const r = await retryTransport(attempt, NOW)

    expect(attempt).toHaveBeenCalledTimes(ATTEMPTS)
    expect(r.ok).toBe(false)
    expect(r.kind).toBe('transport')
    expect(r.attempts).toBe(ATTEMPTS)
    expect(typeof r.ms).toBe('number')
  })

  test('a transport failure that recovers returns the value, and stops early', async () => {
    let n = 0
    const attempt = vi.fn(async () => {
      n += 1
      return n < 2 ? { ok: false, kind: 'transport', detail: 'fetch failed' } : { ok: true, value: [1, 2, 3] }
    })
    const r = await retryTransport(attempt, NOW)

    expect(attempt).toHaveBeenCalledTimes(2)
    expect(r.ok).toBe(true)
    expect(r.value).toEqual([1, 2, 3])
    expect(r.attempts).toBe(2)
  })

  test('AN ANSWER IS NOT RETRIED. The server already said no; asking again is not evidence', async () => {
    const attempt = vi.fn(async () => ({ ok: false, kind: 'answered', status: 401, detail: 'HTTP 401' }))
    const r = await retryTransport(attempt, NOW)

    expect(attempt).toHaveBeenCalledTimes(1)
    expect(r.kind).toBe('answered')
    expect(r.attempts).toBe(1)
  })

  test('an unparseable body is an answer too, and is not retried', async () => {
    const attempt = vi.fn(async () => ({ ok: false, kind: 'unparseable', detail: 'not json' }))
    const r = await retryTransport(attempt, NOW)
    expect(attempt).toHaveBeenCalledTimes(1)
  })

  test('the first success is not delayed: attempt one runs immediately', async () => {
    const attempt = vi.fn(async () => ({ ok: true, value: 1 }))
    const r = await retryTransport(attempt, { attempts: 3, backoff: [999_999, 0, 0] })
    expect(r.ok).toBe(true)
    expect(r.attempts).toBe(1)
  })
})

describe('getJson: classifying a real fetch', () => {
  const url = 'https://project.supabase.co/rest/v1/thing'

  test('a thrown fetch is TRANSPORT, never an answer', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    const r = await getJson(url, { key: 'k', fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.kind).toBe('transport')
    expect(r.detail).toContain('fetch failed')
  })

  test('a non-2xx is ANSWERED, and carries its status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => '{"message":"no"}' }))
    const r = await getJson(url, { key: 'k', fetchImpl })
    expect(r.kind).toBe('answered')
    expect(r.status).toBe(401)
    // One call: a 401 is a fact, not a blip.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  test('a body that dies mid-read is TRANSPORT, because nothing was learned', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error('socket hang up')
      },
    }))
    const r = await getJson(url, { key: 'k', fetchImpl })
    expect(r.kind).toBe('transport')
    expect(fetchImpl).toHaveBeenCalledTimes(ATTEMPTS)
  })

  test('a 200 with JSON is the value', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"a":1}' }))
    const r = await getJson(url, { key: 'k', fetchImpl })
    expect(r.ok).toBe(true)
    expect(r.value).toEqual({ a: 1 })
  })

  test('a 200 that is not JSON is unparseable, not transport', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => '<html>gateway</html>' }))
    const r = await getJson(url, { key: 'k', fetchImpl })
    expect(r.kind).toBe('unparseable')
  })

  test('the request is a GET and carries no write verb', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'true' }))
    await callRpc({ url: 'https://project.supabase.co/', key: 'k', rpc: 'some_guards', fetchImpl })
    const [target, init] = fetchImpl.mock.calls[0]
    expect(target).toBe('https://project.supabase.co/rest/v1/rpc/some_guards')
    // No method at all is a GET. PostgREST serves a STABLE function on GET, and
    // these guards carry an admin credential, so a write verb must never appear.
    expect(init?.method ?? 'GET').toBe('GET')
  })

  test('a bare `true` from an RPC parses to the boolean, which door-live-published relies on', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => 'true' }))
    const r = await callRpc({ url: 'https://p.supabase.co', key: 'k', rpc: 'door_realtime_enabled', fetchImpl })
    expect(r.value).toBe(true)
  })
})

describe('couldNotLook: the sentence that stopped a false instruction', () => {
  test('it says it is transport, and refuses to imply a missing migration', () => {
    const s = couldNotLook('event_lifecycle_guards()', { detail: 'fetch failed', attempts: 3, ms: 5600 })
    expect(s).toContain('could not reach the database')
    expect(s).toContain('3 attempt(s) over 5.6s')
    expect(s).toContain('says NOTHING about what the database contains')
    expect(s).not.toMatch(/apply .*\.sql/i)
  })
})

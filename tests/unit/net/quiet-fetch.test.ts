import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNetworkFailure, quietFetch } from '@/lib/net/quiet-fetch'
import { classifyClientError } from '@/lib/observability/client-error-report'

/*
 * SENTRY JAVASCRIPT-NEXTJS-C, 'TypeError: Load failed' on /events/:slug (15 November 2026, 12:13, Mobile Safari 27 on
 * iOS 18.7, captured by our client error sink, handled). Lawal, 22:01: "It's definitely our fault ... Fix it across every
 * page." 'Load failed' is Safari's own words for a request that never reached us (Chrome: 'Failed to fetch'; Firefox:
 * 'NetworkError when attempting to fetch resource.'). A client fetch on a page tries once more, then gives up quietly,
 * never throwing into the page; and such a failure is reported as a transient network warning, never as a page error.
 */

afterEach(() => vi.unstubAllGlobals())

describe('a dropped request is told apart from a fault', () => {
  it("reads each browser's own words for a request that never arrived", () => {
    expect(isNetworkFailure(new TypeError('Load failed'))).toBe(true)
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkFailure(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isNetworkFailure(new TypeError('The network connection was lost.'))).toBe(true)
    expect(isNetworkFailure(new DOMException('The user aborted a request.', 'AbortError'))).toBe(true)
  })
  it('a fault in our own code is never taken for the network', () => {
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false)
    expect(isNetworkFailure(new Error('Load failed'))).toBe(false)
    expect(isNetworkFailure('Load failed')).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
  })
  it('the client error sink classes the Sentry case as network, and a real fault as a fault', () => {
    expect(classifyClientError(new TypeError('Load failed'))).toBe('network')
    expect(classifyClientError(new TypeError('x is not a function'))).toBe('fault')
  })
})

describe('quietFetch: one more try, then quiet, never a throw', () => {
  it('a request that drops once is tried again and answers', async () => {
    const ok = new Response('{}', { status: 200 })
    const f = vi.fn().mockRejectedValueOnce(new TypeError('Load failed')).mockResolvedValueOnce(ok)
    vi.stubGlobal('fetch', f)
    const res = await quietFetch('/api/location/set', { method: 'POST' }, { waitMs: 0 })
    expect(res).toBe(ok)
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('a request that drops twice resolves to null, with nothing thrown into the page', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('Load failed'))
    vi.stubGlobal('fetch', f)
    await expect(quietFetch('/api/ledger/demand', { method: 'POST' }, { waitMs: 0 })).resolves.toBeNull()
    expect(f).toHaveBeenCalledTimes(2)
  })
  it('a fault that is not the network still surfaces, so it is never hidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Invalid URL')))
    await expect(quietFetch('::', {}, { waitMs: 0 })).rejects.toThrow('Invalid URL')
  })
})

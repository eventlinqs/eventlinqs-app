import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  RENDERABLE_PROVIDERS,
  __resetProviderCache,
  getEnabledProviders,
  isProviderEnabled,
  parseSettingsBody,
} from '@/lib/auth/providers'

/**
 * Locks Phase 2 in place: the provider gate is fail-safe, and it is cached so
 * it does not put a network round trip in front of every auth page render.
 *
 * The fail-safe direction is the whole point. Hiding a working button costs a
 * user one extra click. Showing a broken one costs them
 * {"code":400,"msg":"Unsupported provider: provider is not enabled"} in a bare
 * browser tab, which is what production did on 2026-08-02.
 */

const SETTINGS_URL = 'https://test-project.supabase.co/auth/v1/settings'

function settingsBody(google: boolean) {
  return { external: { google, apple: false, facebook: false, email: true } }
}

function mockFetch(impl: (url: string) => Promise<Response> | Response) {
  return vi.fn((input: RequestInfo | URL) => Promise.resolve(impl(String(input)))) as unknown as typeof fetch
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  __resetProviderCache()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  delete process.env.NEXT_PUBLIC_SUPABASE_URL_PREVIEW
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PREVIEW
})

afterEach(() => {
  globalThis.fetch = originalFetch
  __resetProviderCache()
  vi.restoreAllMocks()
})

describe('parseSettingsBody', () => {
  test('reads the live GoTrue shape', () => {
    expect(parseSettingsBody(settingsBody(true))).toEqual({ google: true })
    expect(parseSettingsBody(settingsBody(false))).toEqual({ google: false })
  })

  test('anything other than a literal true is false', () => {
    // A truthy string or 1 must not be read as enabled.
    expect(parseSettingsBody({ external: { google: 'true' } })).toEqual({ google: false })
    expect(parseSettingsBody({ external: { google: 1 } })).toEqual({ google: false })
  })

  test('a malformed body is all-false, never a crash', () => {
    expect(parseSettingsBody(null)).toEqual({ google: false })
    expect(parseSettingsBody({})).toEqual({ google: false })
    expect(parseSettingsBody({ external: 'nope' })).toEqual({ google: false })
    expect(parseSettingsBody('<html>502 Bad Gateway</html>')).toEqual({ google: false })
  })

  test('every renderable provider appears in the result', () => {
    const parsed = parseSettingsBody(settingsBody(true))
    for (const p of RENDERABLE_PROVIDERS) {
      expect(parsed).toHaveProperty(p)
    }
  })
})

describe('getEnabledProviders fail-safe behaviour', () => {
  test('reads the real endpoint with the anon key', async () => {
    const fetchMock = mockFetch(() => new Response(JSON.stringify(settingsBody(true))))
    globalThis.fetch = fetchMock
    expect(await getEnabledProviders()).toEqual({ google: true })
    expect(String((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toBe(
      SETTINGS_URL,
    )
  })

  test('a non-200 hides the button rather than showing a broken one', async () => {
    globalThis.fetch = mockFetch(() => new Response('nope', { status: 500 }))
    expect(await getEnabledProviders()).toEqual({ google: false })
  })

  test('a network throw hides the button', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('ECONNRESET'))) as unknown as typeof fetch
    expect(await getEnabledProviders()).toEqual({ google: false })
  })

  test('a timeout hides the button', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })),
    ) as unknown as typeof fetch
    expect(await getEnabledProviders()).toEqual({ google: false })
  })

  test('unparseable JSON hides the button', async () => {
    globalThis.fetch = mockFetch(() => new Response('<html>gateway timeout</html>'))
    expect(await getEnabledProviders()).toEqual({ google: false })
  })

  test('missing Supabase env hides the button without attempting a fetch', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const fetchMock = mockFetch(() => new Response(JSON.stringify(settingsBody(true))))
    globalThis.fetch = fetchMock
    expect(await getEnabledProviders()).toEqual({ google: false })
    expect((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(0)
  })
})

describe('caching', () => {
  test('a successful resolution is fetched once and served from memory after', async () => {
    const fetchMock = mockFetch(() => new Response(JSON.stringify(settingsBody(true))))
    globalThis.fetch = fetchMock

    for (let i = 0; i < 25; i += 1) await getEnabledProviders()

    expect((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1)
  })

  test('concurrent cold calls de-duplicate into a single fetch', async () => {
    // A cold serverless instance taking a burst of traffic must not fan out
    // twenty settings requests at Supabase.
    const fetchMock = mockFetch(
      () =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(new Response(JSON.stringify(settingsBody(true)))), 10),
        ) as unknown as Response,
    )
    globalThis.fetch = fetchMock

    const results = await Promise.all(Array.from({ length: 20 }, () => getEnabledProviders()))

    expect((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(1)
    for (const r of results) expect(r).toEqual({ google: true })
  })

  test('a fail-safe answer is cached only briefly so a blip is not sticky', async () => {
    // First call fails, so nothing is enabled. The short TTL means the next
    // window recovers rather than hiding the button for the full five minutes.
    let attempt = 0
    globalThis.fetch = mockFetch(() => {
      attempt += 1
      return attempt === 1
        ? new Response('boom', { status: 503 })
        : new Response(JSON.stringify(settingsBody(true)))
    })

    expect(await getEnabledProviders()).toEqual({ google: false })

    // Fast-forward past the 30s fail-safe TTL without waiting for it.
    const realNow = Date.now
    Date.now = () => realNow() + 31_000
    try {
      __resetProviderCache()
      expect(await getEnabledProviders()).toEqual({ google: true })
    } finally {
      Date.now = realNow
    }
  })
})

describe('isProviderEnabled', () => {
  test('answers for a single provider', async () => {
    globalThis.fetch = mockFetch(() => new Response(JSON.stringify(settingsBody(true))))
    expect(await isProviderEnabled('google')).toBe(true)
  })

  test('answers false when the provider is off, which is production today', async () => {
    globalThis.fetch = mockFetch(() => new Response(JSON.stringify(settingsBody(false))))
    expect(await isProviderEnabled('google')).toBe(false)
  })
})

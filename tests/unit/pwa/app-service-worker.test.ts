import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_SERVICE_WORKER_SCOPE, APP_SERVICE_WORKER_URL } from '@/components/pwa/register-app-worker'

/**
 * public/app-sw.js, run inside a fake worker global so its routing can be
 * driven: which requests it answers, which it leaves alone, what it keeps, and
 * what it does when the network is gone.
 *
 * Close-out C8B.5, Scope v5 10.3 ("a PWA that functions offline"). The browser
 * proof is scripts/verify/scope-10-3-audit.mjs, which cuts a real network
 * against a real build at 390, 768 and 1440. This is the part that can run on
 * every commit, and it covers the case that proof cannot easily reach: the
 * things the worker must REFUSE to cache. A stale price is invisible to a drive
 * that only asks whether a page appeared.
 *
 * The boot harness is the shape tests/unit/scanner/scan-service-worker.test.ts
 * established for the door worker, reused rather than reinvented.
 */
const ROOT = join(__dirname, '..', '..', '..')
const source = readFileSync(join(ROOT, 'public', 'app-sw.js'), 'utf8')
const ORIGIN = 'https://www.example.test'

type Handler = (event: FakeEvent) => void
type FakeEvent = {
  request: { method: string; url: string; mode: string }
  respondWith: ReturnType<typeof vi.fn>
  waitUntil: ReturnType<typeof vi.fn>
}

function boot(opts: { network?: (url: string) => Promise<Response>; cached?: Map<string, Response> } = {}) {
  const handlers: Record<string, Handler> = {}
  const cached = opts.cached ?? new Map<string, Response>()
  const puts: string[] = []
  const adds: string[] = []
  /*
   * KEYS ARE RESOLVED AGAINST THE ORIGIN, because the real Cache API does.
   * `cache.match('/offline')` normalises the string to a Request whose url is
   * absolute, so it finds an entry stored from `new Request('/offline')`. The
   * first version of this fake keyed on the raw argument, so a relative lookup
   * missed an absolute entry and the test reported the worker falling through to
   * its last resort. That was the harness being stricter than the browser, and
   * it would have sent somebody looking for a bug in the worker.
   */
  const key = (k: string | { url: string }) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).href
  const cache = {
    match: async (k: string | { url: string }) => cached.get(key(k)),
    put: async (k: string | { url: string }, res: Response) => {
      puts.push(key(k))
      cached.set(key(k), res)
    },
    add: async (req: { url: string }) => {
      adds.push(key(req))
      cached.set(key(req), new Response('offline page', { status: 200 }))
    },
  }
  const deleted: string[] = []
  const caches = {
    open: async () => cache,
    keys: async () => ['eventlinqs-app-shell-v0', 'eventlinqs-app-shell-v1', 'eventlinqs-door-shell-v1'],
    delete: async (k: string) => {
      deleted.push(k)
      return true
    },
  }
  const self = {
    addEventListener: (name: string, fn: Handler) => {
      handlers[name] = fn
    },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  }
  const fetch = vi.fn((req: { url: string }) =>
    (opts.network ?? (async () => new Response('from the network', { status: 200 })))(req.url),
  )
  new Function('self', 'caches', 'fetch', 'Response', 'URL', 'Request', source)(
    self,
    caches,
    fetch,
    Response,
    URL,
    // A Request stand-in that keeps the url, which is all the worker reads off it.
    class FakeRequest {
      url: string
      constructor(url: string) {
        this.url = new URL(url, ORIGIN).href
      }
    },
  )
  return { handlers, fetch, puts, adds, cached, deleted, self }
}

function fetchEvent(method: string, path: string, mode: string, origin = ORIGIN): FakeEvent {
  return { request: { method, url: `${origin}${path}`, mode }, respondWith: vi.fn(), waitUntil: vi.fn() }
}

/** Run whatever the worker handed to respondWith. */
async function answered(event: FakeEvent): Promise<Response> {
  expect(event.respondWith).toHaveBeenCalledTimes(1)
  return (await event.respondWith.mock.calls[0][0]) as Response
}

describe('what the app worker answers, and what it leaves alone', () => {
  test('a navigation and a content-hashed asset, and nothing else', () => {
    const { handlers } = boot()

    const nav = fetchEvent('GET', '/events/some-event', 'navigate')
    handlers.fetch(nav)
    expect(nav.respondWith).toHaveBeenCalledTimes(1)

    const asset = fetchEvent('GET', '/_next/static/chunks/app.js', 'no-cors')
    handlers.fetch(asset)
    expect(asset.respondWith).toHaveBeenCalledTimes(1)

    for (const e of [
      // A server action, which is how every checkout submit travels.
      fetchEvent('POST', '/events/some-event', 'cors'),
      // An API call, an image, a font: untouched, so the browser does exactly
      // what it would do with no worker at all.
      fetchEvent('GET', '/api/health', 'cors'),
      fetchEvent('GET', '/_next/image?url=x&w=750&q=80', 'no-cors'),
      // Another origin: Stripe, Supabase, the optimiser's source.
      fetchEvent('GET', '/v3/', 'no-cors', 'https://js.stripe.com'),
      // The door belongs to scan-sw.js and this worker must not take it.
      fetchEvent('GET', '/scan/abc', 'navigate'),
    ]) {
      handlers.fetch(e)
      expect(e.respondWith, `${e.request.method} ${e.request.url} ${e.request.mode}`).not.toHaveBeenCalled()
    }
  })
})

describe('what it refuses to keep', () => {
  test('a successful navigation is never cached, so no buyer can be served a stale price', async () => {
    // THE CLAUSE THIS WHOLE FILE EXISTS FOR. scan-sw.js caches navigations and
    // is right to: a door with a stale list still opens a gate. An event page
    // carries a price, a remaining-tickets count and a sale state, and serving
    // yesterday's total would quietly break the ACCC all-in display.
    const { handlers, puts } = boot()
    for (const path of ['/', '/events', '/events/x', '/checkout/abc', '/account/tickets', '/orders/1/confirmation']) {
      const e = fetchEvent('GET', path, 'navigate')
      handlers.fetch(e)
      await answered(e)
    }
    expect(puts).toEqual([])
  })

  test('a content-hashed asset IS kept, because a cached copy can never be the wrong copy', async () => {
    const { handlers, puts } = boot()
    const e = fetchEvent('GET', '/_next/static/chunks/main-abc123.js', 'no-cors')
    handlers.fetch(e)
    await answered(e)
    expect(puts).toEqual([`${ORIGIN}/_next/static/chunks/main-abc123.js`])
  })
})

describe('what it does when the network is gone', () => {
  test('a failed navigation is answered with the precached offline document', async () => {
    const cached = new Map<string, Response>([[`${ORIGIN}/offline`, new Response('the offline page', { status: 200 })]])
    const { handlers } = boot({ network: async () => Promise.reject(new TypeError('Failed to fetch')), cached })
    const e = fetchEvent('GET', '/events/x', 'navigate')
    handlers.fetch(e)
    const res = await answered(e)
    expect(await res.text()).toBe('the offline page')
  })

  test('with nothing precached it still answers EventLinqs rather than nothing at all', async () => {
    // If install ran while the network was already failing the precache is
    // empty. Answering with the inline last resort beats answering with the
    // browser's error page, which is the defect this item closed.
    const { handlers } = boot({ network: async () => Promise.reject(new TypeError('Failed to fetch')) })
    const e = fetchEvent('GET', '/', 'navigate')
    handlers.fetch(e)
    const res = await answered(e)
    const body = await res.text()
    expect(res.status).toBe(503)
    expect(body).toContain('You are offline')
    expect(body).toContain('EventLinqs')
  })

  test('the network is still asked first, every time', async () => {
    const { handlers, fetch } = boot()
    const e = fetchEvent('GET', '/events/x', 'navigate')
    handlers.fetch(e)
    await answered(e)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('install and activate', () => {
  test('install precaches exactly the offline document, with the HTTP cache bypassed', async () => {
    const { handlers, adds } = boot()
    const e = { waitUntil: vi.fn(), request: { method: '', url: '', mode: '' }, respondWith: vi.fn() }
    handlers.install(e as unknown as FakeEvent)
    await e.waitUntil.mock.calls[0][0]
    expect(adds).toEqual([`${ORIGIN}/offline`])
  })

  test('activate deletes older app-shell caches and leaves the door worker alone', async () => {
    const { handlers, deleted } = boot()
    const e = { waitUntil: vi.fn(), request: { method: '', url: '', mode: '' }, respondWith: vi.fn() }
    handlers.activate(e as unknown as FakeEvent)
    await e.waitUntil.mock.calls[0][0]
    expect(deleted).toEqual(['eventlinqs-app-shell-v0'])
    expect(deleted).not.toContain('eventlinqs-door-shell-v1')
  })
})

describe('the registration constants', () => {
  test('the registrar names the file this worker actually is, at the root scope', () => {
    expect(APP_SERVICE_WORKER_URL).toBe('/app-sw.js')
    expect(APP_SERVICE_WORKER_SCOPE).toBe('/')
  })

  test('the worker and the registrar agree about which document is precached', () => {
    // The route exists and is classified `never`; the guard holds both.
    expect(source).toContain("var OFFLINE_URL = '/offline'")
  })
})

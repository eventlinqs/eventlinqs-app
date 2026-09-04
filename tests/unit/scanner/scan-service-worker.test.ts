import { describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DOOR_SHELL_CACHE, DOOR_SERVICE_WORKER_SCOPE, DOOR_SERVICE_WORKER_URL } from '@/lib/scanner/door-types'

/**
 * public/scan-sw.js, run inside a fake worker global so its routing can be
 * driven: which requests it answers, which it leaves alone, and what it does
 * when the network is gone. The real browser proof is the B1 drive, which
 * reloads the scanner with the network cut.
 */
const ROOT = join(__dirname, '..', '..', '..')
const source = readFileSync(join(ROOT, 'public', 'scan-sw.js'), 'utf8')
const ORIGIN = 'https://door.example.test'

type Handler = (event: FakeFetchEvent) => void
type FakeFetchEvent = {
  request: { method: string; url: string; mode: string }
  respondWith: ReturnType<typeof vi.fn>
  waitUntil: ReturnType<typeof vi.fn>
}

function boot(opts: { network?: (url: string) => Promise<Response>; cached?: Map<string, Response> } = {}) {
  const handlers: Record<string, Handler> = {}
  const cached = opts.cached ?? new Map<string, Response>()
  const puts: string[] = []
  const cache = {
    match: async (key: string | { url: string }) => cached.get(typeof key === 'string' ? key : key.url),
    put: async (key: string | { url: string }, res: Response) => {
      const k = typeof key === 'string' ? key : key.url
      puts.push(k)
      cached.set(k, res)
    },
  }
  const caches = { open: async () => cache, keys: async () => ['eventlinqs-door-shell-v0', DOOR_SHELL_CACHE], delete: vi.fn(async () => true) }
  const self = {
    addEventListener: (name: string, fn: Handler) => {
      handlers[name] = fn
    },
    location: { origin: ORIGIN },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
  }
  const fetch = vi.fn((req: { url: string }) => (opts.network ?? (async () => new Response('page', { status: 200 })))(req.url))
  new Function('self', 'caches', 'fetch', 'Response', 'URL', source)(self, caches, fetch, Response, URL)
  return { handlers, fetch, puts, cached, caches, self }
}

function fetchEvent(method: string, path: string, mode: string): FakeFetchEvent {
  return { request: { method, url: `${ORIGIN}${path}`, mode }, respondWith: vi.fn(), waitUntil: vi.fn() }
}

describe('what the worker answers', () => {
  test('a /scan/ navigation and a /_next/static/ asset, and nothing else', () => {
    const { handlers } = boot()
    const scan = fetchEvent('GET', '/scan/abc?_rsc=1', 'navigate')
    handlers.fetch(scan)
    expect(scan.respondWith).toHaveBeenCalledTimes(1)

    const asset = fetchEvent('GET', '/_next/static/chunks/app.js', 'no-cors')
    handlers.fetch(asset)
    expect(asset.respondWith).toHaveBeenCalledTimes(1)

    for (const e of [
      fetchEvent('POST', '/scan/abc', 'cors'),
      fetchEvent('GET', '/checkout', 'navigate'),
      fetchEvent('GET', '/events/x', 'navigate'),
      fetchEvent('GET', '/scan/abc', 'cors'),
      fetchEvent('GET', '/api/health', 'cors'),
      { ...fetchEvent('GET', '/scan/abc', 'navigate'), request: { method: 'GET', url: 'https://other.example.test/scan/abc', mode: 'navigate' } },
    ]) {
      handlers.fetch(e)
      expect(e.respondWith, `${e.request.method} ${e.request.url} ${e.request.mode}`).not.toHaveBeenCalled()
    }
  })

  test('a navigation is fetched from the network first and kept under its path, without the query', async () => {
    const { handlers, puts } = boot()
    const scan = fetchEvent('GET', '/scan/abc?_rsc=xyz', 'navigate')
    handlers.fetch(scan)
    const res = (await scan.respondWith.mock.calls[0][0]) as Response
    expect(res.status).toBe(200)
    await Promise.all(scan.waitUntil.mock.calls.map((c) => c[0]))
    expect(puts).toEqual([`${ORIGIN}/scan/abc`])
  })

  test('with the network gone, the kept page is served; with nothing kept, a 503 that says what to do', async () => {
    const dead = async () => {
      throw new TypeError('Failed to fetch')
    }
    const cached = new Map<string, Response>([[`${ORIGIN}/scan/abc`, new Response('kept page', { status: 200 })]])
    const { handlers } = boot({ network: dead, cached })
    const hit = fetchEvent('GET', '/scan/abc', 'navigate')
    handlers.fetch(hit)
    expect(await ((await hit.respondWith.mock.calls[0][0]) as Response).text()).toBe('kept page')

    const miss = fetchEvent('GET', '/scan/never-opened', 'navigate')
    handlers.fetch(miss)
    const fallback = (await miss.respondWith.mock.calls[0][0]) as Response
    expect(fallback.status).toBe(503)
    const html = await fallback.text()
    expect(html).toContain('has not been opened online on this phone yet')
    // The copy law is about what a person reads; the doctype is not copy.
    expect(html.replace('<!doctype html>', '')).not.toMatch(/[–—!]/)
    expect(html).not.toContain('javascript:')
  })

  test('an asset is served from the cache when kept, and fetched then kept when not', async () => {
    const cached = new Map<string, Response>([[`${ORIGIN}/_next/static/kept.js`, new Response('kept', { status: 200 })]])
    const { handlers, fetch, puts } = boot({ cached })
    const kept = fetchEvent('GET', '/_next/static/kept.js', 'no-cors')
    handlers.fetch(kept)
    expect(await ((await kept.respondWith.mock.calls[0][0]) as Response).text()).toBe('kept')
    expect(fetch).not.toHaveBeenCalled()

    const fresh = fetchEvent('GET', '/_next/static/fresh.js', 'no-cors')
    handlers.fetch(fresh)
    await fresh.respondWith.mock.calls[0][0]
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(puts).toContain(`${ORIGIN}/_next/static/fresh.js`)
  })

  test('activation drops older shell caches, keeps the current one, and claims the open pages', async () => {
    const { handlers, caches, self } = boot()
    const event = { waitUntil: vi.fn() }
    handlers.activate(event as unknown as FakeFetchEvent)
    await event.waitUntil.mock.calls[0][0]
    expect(caches.delete).toHaveBeenCalledWith('eventlinqs-door-shell-v0')
    expect(caches.delete).not.toHaveBeenCalledWith(DOOR_SHELL_CACHE)
    expect(self.clients.claim).toHaveBeenCalled()
  })
})

describe('the contract with the scanner', () => {
  test('the worker and the scanner name the same cache, and the scanner registers it at /scan/', () => {
    expect(/SHELL_CACHE = '([^']+)'/.exec(source)?.[1]).toBe(DOOR_SHELL_CACHE)
    expect(DOOR_SERVICE_WORKER_SCOPE).toBe('/scan/')
    expect(DOOR_SERVICE_WORKER_URL).toBe('/scan-sw.js')
    expect(source).toContain("SCAN_PATH = '/scan/'")
  })
  test('the push worker still registers no fetch handler, so the two cannot collide', () => {
    const push = readFileSync(join(ROOT, 'public', 'push-sw.js'), 'utf8')
    expect(push).not.toMatch(/addEventListener\('fetch'/)
  })
})

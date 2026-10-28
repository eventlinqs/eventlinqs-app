import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * THE ERROR-REPORTING SDK NEVER LANDS IN THE LARGEST PAINT'S WINDOW.
 *
 * #193's Lighthouse gate, 28 October 2026 (run 40616777528): on
 * /events/artist-layer-launch-night-geelong, 4 of 5 traces counted the SDK's
 * chunks (0xv54lyy7mx57.js, 262 KB, with a 47 KB neighbour), fetched at the
 * timer's moment, load plus 3 s, while the hero was still painting on a slower
 * runner: script 671,241 bytes against the 491,520 budget, LCP 5,167 ms against
 * 4,500. The 3 s timer counted from load only, so a page whose paint ran late
 * fetched the SDK inside it. The project manager's 13:27: load the SDK's heavy
 * part only after the page is idle or on first interaction, so a slow runner can
 * never red it again.
 *
 * What these tests hold: the timer waits until 3 s after the LATEST largest
 * paint as well as 3 s after load, with a ceiling so a visitor who never touches
 * the page is still reported; an error and a first interaction still boot at
 * once.
 */

type Handler = (event?: unknown) => void

let now = 0
let listeners: Record<string, Handler[]>
let paintObservers: Array<(entries: Array<{ startTime: number }>) => void>
let bootedAt: number | null

function fire(name: string, event?: unknown) {
  for (const h of [...(listeners[name] ?? [])]) h(event)
}

function paint(at: number) {
  for (const o of paintObservers) o([{ startTime: at }])
}

async function advance(ms: number) {
  now += ms
  await vi.advanceTimersByTimeAsync(ms)
}

async function loadClient() {
  vi.resetModules()
  vi.doMock('@/lib/observability/sentry-client-boot', () => {
    bootedAt = now
    return { bootSentryClient: vi.fn(), captureRouterTransitionStart: vi.fn() }
  })
  await import('../../../instrumentation-client')
}

beforeEach(() => {
  vi.useFakeTimers()
  now = 0
  bootedAt = null
  listeners = {}
  paintObservers = []
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.sentry.io/0')
  const target = {
    addEventListener: (name: string, h: Handler) => {
      ;(listeners[name] ??= []).push(h)
    },
    removeEventListener: (name: string, h: Handler) => {
      listeners[name] = (listeners[name] ?? []).filter((x) => x !== h)
    },
  }
  vi.stubGlobal('window', target)
  vi.stubGlobal('document', { readyState: 'loading' })
  vi.stubGlobal('performance', { now: () => now, mark: () => undefined })
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      private cb: (list: { getEntries: () => Array<{ startTime: number }> }) => void
      constructor(cb: (list: { getEntries: () => Array<{ startTime: number }> }) => void) {
        this.cb = cb
      }
      observe() {
        paintObservers.push((entries) => this.cb({ getEntries: () => entries }))
      }
      disconnect() {
        paintObservers = []
      }
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.doUnmock('@/lib/observability/sentry-client-boot')
})

describe('the error-reporting SDK schedule', () => {
  test('waits 3 s after the latest largest paint, not only 3 s after load', async () => {
    await loadClient()
    await advance(1000)
    fire('load')
    await advance(1100)
    paint(2100) // the hero paints late, 1.1 s after load
    await advance(1900) // load + 3 s: the old schedule's moment
    expect(bootedAt, 'the SDK was fetched while the late paint was 1.9 s old').toBeNull()
    await advance(1100) // the paint + 3 s
    expect(bootedAt).toBe(5100)
  })

  test('a paint before load changes nothing: 3 s after load, as before', async () => {
    await loadClient()
    await advance(800)
    paint(800)
    await advance(200)
    fire('load')
    await advance(3000)
    expect(bootedAt).toBe(4000)
  })

  test('a page that keeps painting is still reported, at the ceiling', async () => {
    await loadClient()
    fire('load')
    for (let t = 1000; t <= 30000; t += 1000) {
      await advance(1000)
      paint(t)
    }
    expect(bootedAt, 'never booted while the page kept painting').not.toBeNull()
    expect(bootedAt as number).toBeLessThanOrEqual(15000)
  })

  test('an error still boots at once, before any paint', async () => {
    await loadClient()
    await advance(50)
    fire('error', { error: new Error('boom') })
    await advance(0)
    expect(bootedAt).toBe(50)
  })

  test('a first interaction still boots at once', async () => {
    await loadClient()
    fire('load')
    await advance(400)
    paint(400)
    fire('pointerdown')
    await advance(0)
    expect(bootedAt).toBe(400)
  })
})

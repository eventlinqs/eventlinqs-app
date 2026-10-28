import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CLIENT_ERROR_QUEUED } from '@/lib/observability/client-error-report'

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
 * The rerun then failed the same way on
 * /events/cat-indie-sounds-live-at-the-enmore-sydney, on a faster runner: the
 * gate collects with a 5 s pause after load, so load plus 3 s is always inside
 * its window.
 *
 * What these tests hold: the timer waits 12 s after load AND after the LATEST
 * largest paint, with a 30 s ceiling so a page that keeps painting is still
 * traced; a thrown error, an error boundary's report and a first interaction
 * still boot at once, so no report ever waits on the timer.
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
  test('waits 12 s after the latest largest paint, not only after load', async () => {
    await loadClient()
    await advance(1000)
    fire('load')
    await advance(3000) // load + 3 s: the schedule that reddened #193's gate
    expect(bootedAt, 'the SDK was fetched inside the gate window').toBeNull()
    await advance(3000)
    paint(7000) // a late candidate, 6 s after load
    await advance(6000) // load + 12 s: the late paint is only 6 s old
    expect(bootedAt, 'the SDK was fetched 6 s after a paint').toBeNull()
    await advance(6000) // the paint + 12 s
    expect(bootedAt).toBe(19000)
  })

  test('a paint before load changes nothing: 12 s after load', async () => {
    await loadClient()
    await advance(800)
    paint(800)
    await advance(200)
    fire('load')
    await advance(11999)
    expect(bootedAt).toBeNull()
    await advance(1)
    expect(bootedAt).toBe(13000)
  })

  test('a page that keeps painting is still traced, at the 30 s ceiling', async () => {
    await loadClient()
    fire('load')
    for (let t = 1000; t <= 40000; t += 1000) {
      await advance(1000)
      paint(t)
    }
    expect(bootedAt, 'never booted while the page kept painting').not.toBeNull()
    expect(bootedAt as number).toBeLessThanOrEqual(30000)
  })

  test('a thrown error still boots at once, before any paint', async () => {
    await loadClient()
    await advance(50)
    fire('error', { error: new Error('boom') })
    await advance(0)
    expect(bootedAt).toBe(50)
  })

  test("an error boundary's report boots at once, never on the timer", async () => {
    await loadClient()
    fire('load')
    await advance(700)
    fire(CLIENT_ERROR_QUEUED)
    await advance(0)
    expect(bootedAt).toBe(700)
  })

  test('the report event is the one instrumentation-client.ts listens for', () => {
    const client = readFileSync(join(__dirname, '../../../instrumentation-client.ts'), 'utf8')
    expect(client).toContain(`const CLIENT_ERROR_QUEUED = '${CLIENT_ERROR_QUEUED}'`)
    expect(client).toMatch(/window\.addEventListener\(CLIENT_ERROR_QUEUED, onReported\)/)
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

// The client error queue is the thing that makes deferring the Sentry SDK safe.
// If it loses a report, deferring the SDK has traded observability for speed,
// which is the worst possible outcome of this change. These tests exist to make
// that trade impossible to make by accident.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  reportClientError,
  setClientErrorSink,
  __resetClientErrorReporting,
} from '@/lib/observability/client-error-report'

describe('client error reporting seam', () => {
  beforeEach(() => {
    __resetClientErrorReporting()
    vi.restoreAllMocks()
    // The dev-mode console fallback is deliberate behaviour, but it makes the
    // test output unreadable. Silence it without disabling it.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('holds reports that arrive before a sink exists, then drains them in order', () => {
    const first = new Error('first')
    const second = new Error('second')

    reportClientError(first, { digest: 'a' })
    reportClientError(second)

    const seen: unknown[] = []
    const drained = setClientErrorSink((report) => seen.push(report.error))

    expect(drained).toBe(2)
    expect(seen).toEqual([first, second])
  })

  it('passes context through to the sink', () => {
    const sink = vi.fn()
    setClientErrorSink(sink)

    const err = new Error('boom')
    reportClientError(err, { digest: 'xyz', route: '/events/test' })

    expect(sink).toHaveBeenCalledWith({
      error: err,
      context: { digest: 'xyz', route: '/events/test' },
    })
  })

  it('reports straight through once a sink is installed, with nothing queued', () => {
    const sink = vi.fn()
    const drained = setClientErrorSink(sink)
    expect(drained).toBe(0)

    reportClientError(new Error('live'))
    expect(sink).toHaveBeenCalledTimes(1)
  })

  it('preserves the Error object itself, so the stack survives the queue', () => {
    const err = new Error('with stack')
    reportClientError(err)

    let received: unknown = null
    setClientErrorSink((report) => {
      received = report.error
    })

    // Identity, not equality: Sentry parses the stack off the real Error.
    expect(received).toBe(err)
    expect((received as Error).stack).toBe(err.stack)
  })

  it('bounds the queue so a render loop cannot grow it without limit', () => {
    for (let i = 0; i < 100; i++) reportClientError(new Error(`e${i}`))

    const seen: unknown[] = []
    const drained = setClientErrorSink((report) => seen.push(report.error))

    expect(drained).toBe(20)
    expect(seen).toHaveLength(20)
    // The FIRST twenty are kept. A boot failure is diagnosed from the first
    // error, not the hundredth.
    expect((seen[0] as Error).message).toBe('e0')
    expect((seen[19] as Error).message).toBe('e19')
  })

  it('accepts a non-Error rejection value without throwing', () => {
    expect(() => reportClientError('a string rejection')).not.toThrow()
    expect(() => reportClientError(undefined)).not.toThrow()

    const seen: unknown[] = []
    setClientErrorSink((report) => seen.push(report.error))
    expect(seen).toEqual(['a string rejection', undefined])
  })
})

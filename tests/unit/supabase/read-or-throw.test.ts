import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_ROW_CODE, ReadFailed, isNoRowError, readOrThrow } from '@/lib/supabase/read-or-throw'

/**
 * THE ONE DOOR FOR A READ THAT DECIDES A 404 (close-out, 12 September 2026, the
 * fourth occurrence of the read-failure class; src/lib/supabase/read-or-throw.ts
 * records it). These tests hold the three answers apart: a row, "no row", and
 * "could not ask", and hold that only the first two ever come back as a value.
 */

const SOCKET_DROPPED = {
  message: 'TypeError: fetch failed',
  details: 'Caused by: SocketError: other side closed (UND_ERR_SOCKET)',
  hint: '',
  code: '',
}

describe('isNoRowError', () => {
  it('recognises PGRST116, the only error that means "not there"', () => {
    expect(isNoRowError({ code: NO_ROW_CODE, message: 'JSON object requested, multiple (or no) rows returned' })).toBe(true)
  })

  it('does not mistake a real fault, a string or nothing for an absence', () => {
    expect(isNoRowError({ code: '42501', message: 'permission denied for table events' })).toBe(false)
    expect(isNoRowError(SOCKET_DROPPED)).toBe(false)
    expect(isNoRowError('PGRST116')).toBe(false)
    expect(isNoRowError(null)).toBe(false)
    expect(isNoRowError(undefined)).toBe(false)
  })
})

describe('readOrThrow', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('answers the row when the read succeeds, asking once', async () => {
    const run = vi.fn(async () => ({ data: { id: 'evt_1' }, error: null }))
    await expect(readOrThrow('test row', run)).resolves.toEqual({ id: 'evt_1' })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('answers null, and only null, when the database itself said "no row"', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn(async () => ({
      data: null,
      error: { code: NO_ROW_CODE, message: 'JSON object requested, multiple (or no) rows returned' },
    }))
    await expect(readOrThrow('test absent', run)).resolves.toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
    // An absence is not a fault and is not logged as one.
    expect(error).not.toHaveBeenCalled()
  })

  it('answers null for an empty result with no error, which is the honest empty answer of maybeSingle()', async () => {
    const run = vi.fn(async () => ({ data: null, error: null }))
    await expect(readOrThrow('test maybe', run)).resolves.toBeNull()
  })

  it('throws ReadFailed, carrying the cause and naming the surface, for a real fault', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fault = { code: '42501', message: 'permission denied for table events' }
    const run = vi.fn(async () => ({ data: null, error: fault }))
    const thrown = await readOrThrow('event-route', run).catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(ReadFailed)
    expect((thrown as ReadFailed).message).toContain('[event-route]')
    expect((thrown as ReadFailed).message).toContain('500 rather than 404')
    expect((thrown as ReadFailed).cause).toBe(fault)
    // A real fault is never retried: 42501 is not a blink.
    expect(run).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('[event-route] read failed'), fault)
  })

  it('asks again after one dropped socket and answers the row the second time', async () => {
    vi.useFakeTimers()
    let calls = 0
    const run = vi.fn(async () => {
      calls += 1
      return calls === 1 ? { data: null, error: SOCKET_DROPPED } : { data: { id: 'evt_2' }, error: null }
    })
    const pending = readOrThrow('test blink', run)
    await vi.advanceTimersByTimeAsync(300)
    await expect(pending).resolves.toEqual({ id: 'evt_2' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('throws, never null, when the socket keeps dropping', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const run = vi.fn(async () => ({ data: null, error: SOCKET_DROPPED }))
    const pending = readOrThrow('test outage', run)
    const verdict = expect(pending).rejects.toBeInstanceOf(ReadFailed)
    // withBuildRetry backs off 250, 500 and 1000ms before giving up.
    await vi.advanceTimersByTimeAsync(2000)
    await verdict
    expect(run).toHaveBeenCalledTimes(4)
  })
})

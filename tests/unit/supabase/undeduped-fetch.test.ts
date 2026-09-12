import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SUPABASE_REQUEST_TIMEOUT_MS, undedupedFetch } from '@/lib/supabase/undeduped-fetch'

/**
 * A RETRY MUST BE A REAL REQUEST. Next's render-time fetch deduplicator hands
 * an identical GET the same promise back, a rejected one included, and opts out
 * only for a request that carries its own signal
 * (node_modules/next/dist/server/lib/dedupe-fetch.js). These tests hold that
 * every Supabase request from this platform's three client doors carries one.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('undedupedFetch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('gives a request with no signal a timeout signal of its own', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
    await undedupedFetch('https://example.test/rest/v1/events?select=id', { method: 'GET', headers: { apikey: 'k' } })
    const init = spy.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal?.aborted).toBe(false)
    expect(init.method).toBe('GET')
    expect(init.headers).toEqual({ apikey: 'k' })
  })

  it('keeps a signal the caller supplied, so .abortSignal() on a query still governs it', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
    const controller = new AbortController()
    await undedupedFetch('https://example.test/x', { signal: controller.signal })
    expect((spy.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal)
  })

  it('two identical calls carry two different signals, which is what defeats the deduplicator', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
    await undedupedFetch('https://example.test/x')
    await undedupedFetch('https://example.test/x')
    const [a, b] = spy.mock.calls.map((c) => (c[1] as RequestInit).signal)
    expect(a).not.toBe(b)
  })

  it('the timeout is a named constant and is generous', () => {
    expect(SUPABASE_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(10_000)
  })
})

describe('the three client doors pass it', () => {
  it.each([
    'src/lib/supabase/public-client.ts',
    'src/lib/supabase/admin.ts',
    'src/lib/supabase/server.ts',
  ])('%s', (file) => {
    const source = read(file)
    expect(source).toContain("from './undeduped-fetch'")
    expect(source).toMatch(/global:\s*\{\s*fetch:\s*undedupedFetch/)
  })
})

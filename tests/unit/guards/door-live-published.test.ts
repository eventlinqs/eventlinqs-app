import { describe, expect, test, vi } from 'vitest'
import { decide, ask, RPC, MIGRATION } from '../../../scripts/guards/door-live-published.mjs'

const URL = 'https://vkapkibzokmfaxqogypq.supabase.co'

describe('decide', () => {
  test('SKIPs by name without a real project URL, or without a key that may ask', () => {
    expect(decide({ url: '', serviceKey: 'k', answer: { value: true } })).toMatchObject({ verdict: 'SKIP' })
    expect(decide({ url: 'https://placeholder.supabase.co', serviceKey: 'k', answer: { value: true } }).verdict).toBe('SKIP')
    const noKey = decide({ url: URL, serviceKey: '', answer: { value: true } })
    expect(noKey.verdict).toBe('SKIP')
    expect(noKey.reason).toMatch(/SUPABASE_SERVICE_ROLE_KEY/)
  })
  test('PASSes when the database says the table is published', () => {
    expect(decide({ url: URL, serviceKey: 'k', answer: { value: true } })).toEqual({ verdict: 'PASS', reason: 'ticket_scans is in the supabase_realtime publication' })
  })
  test('FAILs, naming the migration, when the table is not published or the probe cannot be asked', () => {
    const notPublished = decide({ url: URL, serviceKey: 'k', answer: { value: false } })
    expect(notPublished.verdict).toBe('FAIL')
    expect(notPublished.reason).toContain(MIGRATION)
    const missing = decide({ url: URL, serviceKey: 'k', answer: { error: 'HTTP 404 function not found' } })
    expect(missing.verdict).toBe('FAIL')
    expect(missing.reason).toMatch(/could not be asked/)
    expect(missing.reason).toContain(MIGRATION)
  })
})

describe('ask', () => {
  test('GETs the STABLE RPC with the service key (no write verb, so the production-write guard has nothing to read) and reads true or false off the body', async () => {
    const fetchImpl = vi.fn(async (url: string, init: { method?: string; body?: string; headers: Record<string, string> }) => {
      expect(url).toBe(`${URL}/rest/v1/rpc/${RPC}`)
      expect(init.method).toBeUndefined()
      expect(init.body).toBeUndefined()
      expect(init.headers.apikey).toBe('service')
      expect(init.headers.Authorization).toBe('Bearer service')
      return new Response('true', { status: 200 })
    })
    expect(await ask({ url: URL, serviceKey: 'service', fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ value: true })
    const falsy = vi.fn(async () => new Response('false', { status: 200 }))
    expect(await ask({ url: URL, serviceKey: 'service', fetchImpl: falsy as unknown as typeof fetch })).toEqual({ value: false })
  })
  test('a non-200 answer or a thrown fetch is an error, never a value', async () => {
    const denied = vi.fn(async () => new Response('{"message":"permission denied"}', { status: 401 }))
    expect((await ask({ url: URL, serviceKey: 'k', fetchImpl: denied as unknown as typeof fetch })).error).toMatch(/HTTP 401/)
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect((await ask({ url: URL, serviceKey: 'k', fetchImpl: down as unknown as typeof fetch })).error).toBe('fetch failed')
  })
})

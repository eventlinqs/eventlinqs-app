import { afterEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * THE SHARED STORE IS PINGED, AND ITS OUTAGE STILL RAISES THE ALARM (the project
 * manager's 13:30 of 24 October 2026, item 5).
 *
 * Upstash suspended the account and the database had been hibernated, and
 * nothing told us: no health check asked the store (the AI check said
 * "cost-guard store reachable" after only reading its configuration), and the
 * sentinel's dedupe called the store with no catch, so a store that did not
 * answer stopped every alert, its own included. These pin both halves.
 */

const store = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/redis/client', () => ({ getRedisClient: () => store.client }))
const sent = vi.hoisted(() => ({ emails: [] as unknown[] }))
vi.mock('@/lib/email/send', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  return { ...real, sendEmail: async (msg: unknown) => { sent.emails.push(msg); return { ok: true } } }
})
vi.mock('@/lib/env/destinations', () => ({ alertDestination: () => 'alerts@example.com' }))

afterEach(() => {
  store.client = null
  sent.emails = []
  vi.unstubAllEnvs()
})

describe('the health check pings the store', () => {
  test('a store that answers PONG is up', async () => {
    store.client = { ping: async () => 'PONG' }
    const { checkRedis } = await import('@/lib/health/checks')
    expect(await checkRedis()).toMatchObject({ id: 'redis', ok: true, severity: 'critical', detail: 'answered PONG' })
  })

  test('a store that does not answer is DOWN, critical, with its own error quoted', async () => {
    store.client = { ping: async () => { throw new TypeError('s.map is not a function') } }
    const { checkRedis } = await import('@/lib/health/checks')
    const r = await checkRedis()
    expect(r).toMatchObject({ id: 'redis', ok: false, severity: 'critical' })
    expect(r.detail).toContain('s.map is not a function')
  })

  test('no store configured is DOWN in production, and allowed locally', async () => {
    const { checkRedis } = await import('@/lib/health/checks')
    vi.stubEnv('NODE_ENV', 'production')
    expect(await checkRedis()).toMatchObject({ id: 'redis', ok: false, severity: 'critical' })
    vi.stubEnv('NODE_ENV', 'test')
    expect(await checkRedis()).toMatchObject({ id: 'redis', ok: true })
  })

  test('the sentinel runs it with every other check', () => {
    const source = readFileSync('src/lib/health/checks.ts', 'utf8')
    expect(source).toMatch(/timed\('redis', \(\) => checkRedis\(\)\)/)
    expect(source).not.toMatch(/cost-guard store reachable'/)
  })
})

describe('the alert still goes when the store does not answer', () => {
  test('routeAlerts treats every failing critical check as new and emails it', async () => {
    store.client = {
      set: async () => { throw new TypeError('s.map is not a function') },
      getdel: async () => { throw new TypeError('s.map is not a function') },
    }
    const { routeAlerts } = await import('@/lib/health/runner')
    const failing = { id: 'redis', label: 'Shared store (Upstash)', severity: 'critical' as const, ok: false, detail: 'could not reach it' }
    const routed = await routeAlerts([failing])
    expect(routed.toAlertIds).toEqual(['redis'])
    expect(routed.alerted).toBe(true)
    expect(sent.emails).toHaveLength(1)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * THE ALERTS SURVIVE UPSTASH (the PM's 12:25 item 6 of 16 November 2026: Upstash wrote on 13 November that its US$10.00
 * payment was unsuccessful again). Read on 16 November: every Upstash call on the site sits in a try block and falls back
 * (the fee and inventory caches read the database, the rate limits degrade to the in-process limiter, AI spend fails
 * closed, the launch kit drafts report themselves unsaved), except one: the health alerts' dedupe. A suspended account
 * made it throw, so the sentinel's CRITICAL email was never sent. It now fails open, logged: without the store, a check
 * still failing alerts in the first run of each 30 minute window, the same cooldown the store keeps.
 */
const sent: { subject: string }[] = []
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async (m: { subject: string }) => { sent.push(m); return { ok: true } }) }))
vi.mock('@/lib/env/destinations', () => ({ alertDestination: () => 'alerts@example.com' }))
vi.mock('@/lib/redis/client', () => ({
  getRedisClient: () => ({
    set: async () => { throw new Error('ERR your account is suspended') },
    getdel: async () => { throw new Error('ERR your account is suspended') },
  }),
}))

import { routeAlerts } from '@/lib/health/runner'

const failing = [{ id: 'visitor-dead-booking', label: 'Booking links', severity: 'critical' as const, ok: false, detail: 'dead' }]

describe('the health alerts when Upstash refuses', () => {
  beforeEach(() => { sent.length = 0 })

  it('still emails a CRITICAL fault, and says it was sent without the store', async () => {
    const r = await routeAlerts(failing as never, { now: new Date('2026-11-16T00:40:00Z'), everyMinutes: 360 })
    expect(r.alerted).toBe(true)
    expect(r.toAlertIds).toEqual(['visitor-dead-booking'])
    expect(sent).toHaveLength(1)
  })

  it('a 5 minute check alerts once in each 30 minute window, as the store would', async () => {
    const at = (iso: string) => routeAlerts(failing as never, { now: new Date(iso), everyMinutes: 5 })
    expect((await at('2026-11-16T01:00:30Z')).alerted).toBe(true)
    expect((await at('2026-11-16T01:05:30Z')).alerted).toBe(false)
    expect((await at('2026-11-16T01:25:30Z')).alerted).toBe(false)
    expect((await at('2026-11-16T01:30:30Z')).alerted).toBe(true)
  })
})

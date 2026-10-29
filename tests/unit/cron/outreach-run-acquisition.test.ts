// The outreach run refreshes every organiser's acquisition state (supabase/migrations/20261030034001): the states a
// night moves (qualified, active, recurring) have no trigger on events, so this run, every 15 minutes, is what moves
// them. It writes no message, so it runs whatever the sender's mode; a fault in it is reported in the run's answer and
// never stops the sender's step.

import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({ rpcError: false as boolean, rpcCalls: [] as { name: string; args: unknown }[] }))

function makeAdminMock() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { mode: 'hold', from_address: 'hello@eventlinqs.com', changed_by: null, dns_checked_at: new Date().toISOString() }, error: null }),
        }),
      }),
    }),
    rpc: vi.fn(async (name: string, args: unknown) => {
      h.rpcCalls.push({ name, args })
      if (name !== 'organiser_acquisition_refresh_all') return { data: null, error: null }
      return h.rpcError ? { data: null, error: { message: 'boom' } } : { data: 3, error: null }
    }),
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminMock() }))
vi.mock('@/lib/outreach/sender', () => ({ runOutreachSender: async () => ({ mode: 'hold', sent: [], failed: [], refused: [], outsideHours: 0 }) }))
vi.mock('@/lib/outreach/dns-check', () => ({ recordSendingDomainCheck: async () => 'not run' }))
vi.mock('@/lib/outreach/graph', () => ({ graphConfigFromEnv: () => null, graphReadInbox: async () => [] }))

import { GET } from '@/app/api/cron/outreach-run/route'

const req = { headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? 'Bearer sekret' : null) } } as unknown as NextRequest

beforeEach(() => {
  h.rpcError = false
  h.rpcCalls = []
  process.env.CRON_SECRET = 'sekret'
})

describe('the outreach run moves the acquisition states', () => {
  test('on hold it still refreshes every organiser, naming itself as the proof', async () => {
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(h.rpcCalls).toContainEqual({ name: 'organiser_acquisition_refresh_all', args: { p_proved_by: 'outreach-run' } })
    expect(body.acquisition).toEqual({ changed: 3 })
  })

  test('a refresh fault is reported and the run still answers, the sender having run', async () => {
    h.rpcError = true
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.acquisition).toEqual({ error: 'boom' })
    expect(body.sent.mode).toBe('hold')
  })
})

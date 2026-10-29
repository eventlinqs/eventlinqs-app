import { createHmac, randomBytes } from 'node:crypto'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/* POST /api/webhooks/resend (window 6, 29 October 2026). The signature is made here exactly as a Svix-signed webhook is
   (HMAC-SHA256 of "id.timestamp.body" with the base64 secret after "whsec_", sent as "v1,<base64>"), so the installed
   SDK's own resend.webhooks.verify is exercised, never mocked. Only the database and the consent ledger are stand-ins. */

const upserts: unknown[] = []
const stops: unknown[] = []
let failWrite = false
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      upsert: async (row: unknown) => {
        if (failWrite) return { error: { message: 'boom' }, count: null }
        upserts.push(row)
        return { error: null, count: 1 }
      },
    }),
  }),
}))
vi.mock('@/lib/consent/ledger', () => ({ recordSuppressionEvent: async (_db: unknown, p: unknown) => (stops.push(p), true) }))
vi.mock('@/lib/observability/sentry', () => ({ captureException: () => undefined }))

import { POST } from '@/app/api/webhooks/resend/route'

const secretBytes = randomBytes(24)
const SECRET = `whsec_${secretBytes.toString('base64')}`

function signed(body: string, opts: { secret?: Buffer; id?: string } = {}) {
  const id = opts.id ?? `msg_${Math.random().toString(36).slice(2)}`
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', opts.secret ?? secretBytes).update(`${id}.${ts}.${body}`).digest('base64')
  return new Request('https://www.eventlinqs.com.au/api/webhooks/resend', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` },
  }) as unknown as Parameters<typeof POST>[0]
}

const complaint = JSON.stringify({ type: 'email.complained', created_at: '2026-10-29T11:00:00.000Z', data: { email_id: 'em_1', to: ['Someone@Example.com'] } })

beforeEach(() => {
  upserts.length = 0
  stops.length = 0
  failWrite = false
  process.env.RESEND_WEBHOOK_SECRET = SECRET
  process.env.RESEND_API_KEY = 'test-key-not-used-to-verify'
})

describe('POST /api/webhooks/resend', () => {
  test('no secret configured: 503, nothing written', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    expect((await POST(signed(complaint))).status).toBe(503)
    expect(upserts).toEqual([])
  })

  test('no signature headers: 400, nothing written', async () => {
    const res = await POST(new Request('https://x/api/webhooks/resend', { method: 'POST', body: complaint }) as unknown as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
    expect(upserts).toEqual([])
  })

  test('signed with another secret: 400, nothing written', async () => {
    expect((await POST(signed(complaint, { secret: randomBytes(24) }))).status).toBe(400)
    expect(upserts).toEqual([])
  })

  test('a body changed after signing: 400, nothing written', async () => {
    const req = signed(complaint)
    const tampered = new Request(req.url, { method: 'POST', body: complaint.replace('em_1', 'em_2'), headers: req.headers }) as unknown as Parameters<typeof POST>[0]
    expect((await POST(tampered)).status).toBe(400)
    expect(upserts).toEqual([])
  })

  test('a correctly signed complaint: recorded once, and a marketing stop in the consent ledger', async () => {
    const res = await POST(signed(complaint, { id: 'msg_fixed' }))
    expect(res.status).toBe(200)
    expect(upserts).toEqual([expect.objectContaining({ provider: 'resend', provider_event_id: 'msg_fixed', event_type: 'email.complained', address: 'someone@example.com', undeliverable: false })])
    expect(stops).toEqual([expect.objectContaining({ email: 'someone@example.com', channel: 'email', scope: 'all_marketing', requestSource: 'resend_webhook_complaint' })])
  })

  test('a correctly signed open is acknowledged and records nothing', async () => {
    const res = await POST(signed(JSON.stringify({ type: 'email.opened', created_at: '2026-10-29T11:00:00.000Z', data: { email_id: 'em_9', to: ['a@b.com'] } })))
    expect(res.status).toBe(200)
    expect(upserts).toEqual([])
  })

  test('a write that fails answers 500, so Resend retries', async () => {
    failWrite = true
    expect((await POST(signed(complaint))).status).toBe(500)
  })
})

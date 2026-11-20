import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/contact (WINDOW 5C, 21 November 2026). The contact page used to open a mailto: link and claim "Message
 * received" whatever happened; it now posts here, and this route answers ok ONLY when the provider accepted the email.
 * Every answer the page relies on is held here: bad input, delivered, the provider failing, the rate limit, and the
 * hidden field a script fills.
 */
const sent = vi.hoisted(() => ({ calls: [] as unknown[], result: { id: 're_123' } as { id: string } | Error }))
const limit = vi.hoisted(() => ({ ok: true }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(async (input: unknown) => {
    sent.calls.push(input)
    if (sent.result instanceof Error) throw sent.result
    return sent.result
  }),
}))
vi.mock('@/lib/redis/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ ok: limit.ok })),
  clientIp: () => '203.0.113.9',
}))
vi.mock('@/lib/env/destinations', () => ({ supportDestination: () => 'hello@eventlinqs.com' }))

import { POST } from '@/app/api/contact/route'

const good = { name: 'Aria', email: 'aria@example.com', subject: 'Photos', message: 'I could not upload my photographs.' }
const req = (body: unknown) =>
  new Request('https://www.eventlinqs.com.au/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

describe('POST /api/contact', () => {
  beforeEach(() => {
    sent.calls = []
    sent.result = { id: 're_123' }
    limit.ok = true
  })

  it('delivers the message to the support inbox and answers ok only then', async () => {
    const res = await POST(req(good))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(sent.calls).toHaveLength(1)
    const mail = sent.calls[0] as { to: string; messageType: string; recipientRole: string; text: string; subject: string }
    expect(mail.to).toBe('hello@eventlinqs.com')
    expect(mail.messageType).toBe('support_contact')
    expect(mail.recipientRole).toBe('support')
    expect(mail.subject).toBe('Contact page: Photos')
    expect(mail.text).toContain('aria@example.com')
    expect(mail.text).toContain('I could not upload my photographs.')
  })

  it('answers 502, never ok, when the provider refuses', async () => {
    sent.result = new Error('Resend 429')
    const res = await POST(req(good))
    expect(res.status).toBe(502)
    expect((await res.json()).ok).toBe(false)
  })

  it('refuses an address that is not one, and sends nothing', async () => {
    const res = await POST(req({ ...good, email: 'not-an-address' }))
    expect(res.status).toBe(400)
    expect(sent.calls).toHaveLength(0)
  })

  it('answers 429 when the network is over its limit, and sends nothing', async () => {
    limit.ok = false
    const res = await POST(req(good))
    expect(res.status).toBe(429)
    expect(sent.calls).toHaveLength(0)
  })

  it('drops a submission that filled the hidden field, without sending', async () => {
    const res = await POST(req({ ...good, website: 'https://spam.example' }))
    expect(res.status).toBe(200)
    expect(sent.calls).toHaveLength(0)
  })

  it('escapes what the visitor typed in the email body', async () => {
    await POST(req({ ...good, message: '<script>alert(1)</script>' }))
    const mail = sent.calls[0] as { html: string }
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;script&gt;')
  })
})

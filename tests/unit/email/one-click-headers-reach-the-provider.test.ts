// THE HEADERS HAVE TO REACH THE PROVIDER, NOT JUST THE TYPE SYSTEM.
//
// The registered guard (scripts/guards/marketing-mail-carries-one-click.mjs)
// reads source and can prove that the send call names input.headers. It cannot
// prove the object handed to Resend actually carries them, and the difference
// between those two matters: a transport that accepted the field and dropped it
// would typecheck, satisfy every caller, render correctly, return a message id
// and go green everywhere, while every marketing message left without the
// one-click pair. That is exactly the shape of the original defect.
//
// So this intercepts the provider call itself and asserts the payload.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  sends: [] as Record<string, unknown>[],
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>) => {
        h.sends.push(payload)
        return { data: { id: 'msg-1' }, error: null }
      },
    }
  },
}))

// The matrix refuses an undeclared (type, role) pair at send time. This send is
// a real declared one: the campaigner's outbound growth message to a prospect.
const { sendEmail } = await import('@/lib/email/send')
const { oneClickUnsubscribeHeaders } = await import('@/lib/consent/one-click')

const saved = { key: process.env.RESEND_API_KEY, transport: process.env.EMAIL_TRANSPORT }

beforeEach(() => {
  h.sends = []
  process.env.RESEND_API_KEY = 're_test_key'
  delete process.env.EMAIL_TRANSPORT
})

afterEach(() => {
  if (saved.key === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = saved.key
  if (saved.transport === undefined) delete process.env.EMAIL_TRANSPORT
  else process.env.EMAIL_TRANSPORT = saved.transport
})

const TOKEN = '6f1b1d1e-2c3a-4b5c-8d9e-0f1a2b3c4d5e'

describe('what the provider is actually handed', () => {
  it('carries both one-click headers on a campaign send', async () => {
    await sendEmail({
      to: 'prospect@example.com',
      subject: 'A night you might like',
      html: '<p>hello</p>',
      text: 'hello',
      messageType: 'campaign_send',
      recipientRole: 'prospect',
      headers: oneClickUnsubscribeHeaders('https://eventlinqs.com', TOKEN),
    })

    expect(h.sends).toHaveLength(1)
    expect(h.sends[0].headers).toEqual({
      'List-Unsubscribe': `<https://eventlinqs.com/api/marketing/one-click-unsubscribe/${TOKEN}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
  })

  it('sends no headers key at all when a message has none, so nothing existing changed', async () => {
    // Every transactional send site predates this field. None of them should
    // start putting an empty object on the wire.
    await sendEmail({
      to: 'buyer@example.com',
      subject: 'Your ticket',
      html: '<p>ticket</p>',
      messageType: 'campaign_send',
      recipientRole: 'prospect',
    })

    expect(h.sends).toHaveLength(1)
    expect(h.sends[0]).not.toHaveProperty('headers')
  })

  it('sends no headers key for an empty object either', async () => {
    await sendEmail({
      to: 'buyer@example.com',
      subject: 'Your ticket',
      html: '<p>ticket</p>',
      messageType: 'campaign_send',
      recipientRole: 'prospect',
      headers: {},
    })

    expect(h.sends[0]).not.toHaveProperty('headers')
  })
})

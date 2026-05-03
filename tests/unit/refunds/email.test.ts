import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendMock } }
  },
}))

import { sendRefundEmail } from '@/lib/refunds/email'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyRecord = Record<string, unknown>

interface State {
  org: AnyRecord | null
  ownerProfile: AnyRecord | null
  order: AnyRecord | null
  buyerProfile: AnyRecord | null
}

function makeClient(state: State): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === 'organisations') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: state.org, error: null }),
          }),
        }),
      }
    }
    if (table === 'profiles') {
      // Switch between owner and buyer profile by call order; tests set both equal where needed.
      return {
        select: () => ({
          eq: (_col: string, value: unknown) => ({
            maybeSingle: () =>
              Promise.resolve({
                data:
                  value === (state.org as AnyRecord | null)?.owner_id
                    ? state.ownerProfile
                    : state.buyerProfile,
                error: null,
              }),
          }),
        }),
      }
    }
    if (table === 'orders') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: state.order, error: null }),
          }),
        }),
      }
    }
    throw new Error(`unexpected table: ${table}`)
  })
  return { from } as unknown as SupabaseClient
}

const ORIG_KEY = process.env.RESEND_API_KEY

beforeEach(() => {
  sendMock.mockReset()
  process.env.RESEND_API_KEY = 'test_key'
})
afterEach(() => {
  if (ORIG_KEY === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = ORIG_KEY
})

describe('sendRefundEmail', () => {
  test('no-ops when RESEND_API_KEY unset', async () => {
    delete process.env.RESEND_API_KEY
    const client = makeClient({ org: null, ownerProfile: null, order: null, buyerProfile: null })
    await sendRefundEmail(client, 'org-1', 'refund_requested', { refundId: 'r1', orderId: 'o1', amountCents: 100, currency: 'aud' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  test('refund_requested goes to organiser owner with org name and amount', async () => {
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme Events', owner_id: 'owner-1' },
      ownerProfile: { email: 'owner@example.com', full_name: 'Owner' },
      order: null,
      buyerProfile: null,
    })
    await sendRefundEmail(client, 'org-1', 'refund_requested', {
      refundId: 'r1', orderId: 'o12345678', amountCents: 5000, currency: 'aud',
      buyerMessage: 'Cant attend',
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toBe('owner@example.com')
    expect(call.subject).toContain('Refund request')
    expect(call.html).toContain('AUD 50.00')
    expect(call.html).toContain('Cant attend')
  })

  test('refund_processed goes to buyer profile email', async () => {
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme', owner_id: 'owner-1' },
      ownerProfile: { email: 'owner@example.com', full_name: 'Owner' },
      order: { user_id: 'buyer-1', guest_email: null, guest_name: null },
      buyerProfile: { email: 'buyer@example.com', full_name: 'Buyer' },
    })
    await sendRefundEmail(client, 'org-1', 'refund_processed', { refundId: 'r1', orderId: 'o1', amountCents: 1500, currency: 'aud' })
    const call = sendMock.mock.calls[0][0]
    expect(call.to).toBe('buyer@example.com')
    expect(call.subject).toContain('processed')
  })

  test('refund_processed falls back to guest_email when no user', async () => {
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme', owner_id: 'owner-1' },
      ownerProfile: { email: 'owner@example.com', full_name: 'Owner' },
      order: { user_id: null, guest_email: 'guest@example.com', guest_name: 'Guest' },
      buyerProfile: null,
    })
    await sendRefundEmail(client, 'org-1', 'refund_processed', { refundId: 'r1', orderId: 'o1', amountCents: 100, currency: 'aud' })
    expect(sendMock.mock.calls[0][0].to).toBe('guest@example.com')
  })

  test('refund_denied includes escaped denial reason', async () => {
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme', owner_id: 'owner-1' },
      ownerProfile: { email: 'owner@example.com', full_name: 'Owner' },
      order: { user_id: null, guest_email: 'g@example.com', guest_name: 'G' },
      buyerProfile: null,
    })
    await sendRefundEmail(client, 'org-1', 'refund_denied', {
      refundId: 'r1', orderId: 'o1', amountCents: 100, currency: 'aud',
      denialReason: '<script>alert(1)</script>',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).toContain('&lt;script&gt;')
    expect(call.html).not.toContain('<script>')
  })

  test('Resend error is caught, never thrown', async () => {
    sendMock.mockRejectedValueOnce(new Error('boom'))
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme', owner_id: 'owner-1' },
      ownerProfile: { email: 'owner@example.com', full_name: 'Owner' },
      order: null,
      buyerProfile: null,
    })
    await expect(
      sendRefundEmail(client, 'org-1', 'refund_requested', { refundId: 'r1', orderId: 'o1', amountCents: 1, currency: 'aud' })
    ).resolves.toBeUndefined()
  })
})

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('resend', () => ({
  Resend: function MockResend() {
    return { emails: { send: sendMock } }
  },
}))

import { sendPayoutEmail } from '@/lib/payouts/email'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnyRecord = Record<string, unknown>

interface AdminMock {
  org: AnyRecord | null
  profile: AnyRecord | null
}

function makeClient(state: AdminMock): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === 'organisations') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: state.org, error: null }),
          }),
        }),
      }
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: state.profile, error: null }),
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

describe('sendPayoutEmail', () => {
  test('no-ops when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY
    const client = makeClient({ org: null, profile: null })
    await sendPayoutEmail(client, 'org-1', 'payout_paid', {
      amountCents: 1000,
      currency: 'aud',
      arrivalDate: null,
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  test('no-ops when organisation has no owner email', async () => {
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme Events', owner_id: 'user-1' },
      profile: { email: null },
    })
    await sendPayoutEmail(client, 'org-1', 'payout_paid', {
      amountCents: 1000,
      currency: 'aud',
      arrivalDate: null,
    })
    expect(sendMock).not.toHaveBeenCalled()
  })

  test('payout_initiated subject mentions org name and amount', async () => {
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme Events', owner_id: 'user-1' },
      profile: { email: 'owner@example.com' },
    })
    await sendPayoutEmail(client, 'org-1', 'payout_initiated', {
      amountCents: 25000,
      currency: 'aud',
      arrivalDate: '2026-05-15T00:00:00Z',
    })
    expect(sendMock).toHaveBeenCalledTimes(1)
    const call = sendMock.mock.calls[0][0]
    expect(call.subject).toContain('Acme Events')
    expect(call.html).toContain('AUD 250.00')
    expect(call.to).toBe('owner@example.com')
  })

  test('payout_failed includes failure reason and escapes html', async () => {
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme Events', owner_id: 'user-1' },
      profile: { email: 'owner@example.com' },
    })
    await sendPayoutEmail(client, 'org-1', 'payout_failed', {
      amountCents: 5000,
      currency: 'aud',
      arrivalDate: null,
      failureReason: 'Insufficient funds <script>alert(1)</script>',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(call.html).not.toContain('<script>alert(1)</script>')
  })

  test('reserve_released includes event title when provided', async () => {
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme Events', owner_id: 'user-1' },
      profile: { email: 'owner@example.com' },
    })
    await sendPayoutEmail(client, 'org-1', 'reserve_released', {
      amountCents: 1500,
      currency: 'aud',
      arrivalDate: null,
      eventTitle: 'Lagos Live',
    })
    const call = sendMock.mock.calls[0][0]
    expect(call.html).toContain('Lagos Live')
    expect(call.subject).toContain('Reserve released')
  })

  test('Resend send error is caught and logged, never thrown', async () => {
    sendMock.mockRejectedValueOnce(new Error('boom'))
    const client = makeClient({
      org: { id: 'org-1', name: 'Acme Events', owner_id: 'user-1' },
      profile: { email: 'owner@example.com' },
    })
    await expect(
      sendPayoutEmail(client, 'org-1', 'payout_paid', {
        amountCents: 100,
        currency: 'aud',
        arrivalDate: null,
      })
    ).resolves.toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import {
  recordOrganiserMarketingConsent,
  recordPlatformUpdateConsent,
  withdrawOrganiserConsentByToken,
} from '@/lib/consent/record'

type Call = { table: string; op: string; payload?: unknown; opts?: unknown }

/**
 * Minimal fake admin client capturing the calls the consent recorders make.
 * Implements just the chained shapes used: upsert, and the select/eq/maybeSingle
 * + update/eq the withdrawal uses.
 */
function fakeAdmin(withdrawRow: unknown = null) {
  const calls: Call[] = []
  const client = {
    calls,
    from(table: string) {
      return {
        upsert(payload: unknown, opts: unknown) {
          calls.push({ table, op: 'upsert', payload, opts })
          return Promise.resolve({ error: null })
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: withdrawRow }),
              }
            },
          }
        },
        update(payload: unknown) {
          calls.push({ table, op: 'update', payload })
          return { eq: async () => ({ error: null }) }
        },
      }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

describe('recordOrganiserMarketingConsent', () => {
  it('upserts a granted, per-organiser consent with the exact wording and version', async () => {
    const admin = fakeAdmin()
    const ok = await recordOrganiserMarketingConsent(admin, {
      organisationId: 'org-1',
      organiserName: 'Soundwave',
      email: 'Buyer@Example.com',
      userId: 'user-1',
      orderId: 'order-1',
      eventId: 'event-1',
      source: 'checkout',
      at: '2026-06-24T00:00:00.000Z',
    })
    expect(ok).toBe(true)
    const call = admin.calls.find((c: Call) => c.table === 'organiser_marketing_consents')
    expect(call).toBeTruthy()
    const row = call!.payload as Record<string, unknown>
    expect(row.organisation_id).toBe('org-1')
    expect(row.email).toBe('buyer@example.com') // normalised
    expect(row.status).toBe('granted')
    expect(row.withdrawn_at).toBeNull()
    expect(String(row.consent_text)).toContain('Soundwave')
    expect(row.consent_version).toBeTruthy()
    expect(call!.opts).toEqual({ onConflict: 'organisation_id,email' }) // per-organiser key
  })

  it('does not throw on a blank email and reports failure', async () => {
    const admin = fakeAdmin()
    const ok = await recordOrganiserMarketingConsent(admin, {
      organisationId: 'org-1',
      organiserName: 'Soundwave',
      email: '   ',
      at: '2026-06-24T00:00:00.000Z',
    })
    expect(ok).toBe(false)
    expect(admin.calls.length).toBe(0)
  })
})

describe('recordPlatformUpdateConsent', () => {
  it('upserts the platform opt-in into email_subscribers, distinct from organiser marketing', async () => {
    const admin = fakeAdmin()
    const ok = await recordPlatformUpdateConsent(admin, { email: 'a@b.com', source: 'checkout' })
    expect(ok).toBe(true)
    const call = admin.calls.find((c: Call) => c.table === 'email_subscribers')
    expect(call).toBeTruthy()
    const row = call!.payload as Record<string, unknown>
    expect(row.consent).toBe(true)
    expect(row.unsubscribed_at).toBeNull()
    // never written to the organiser consent table
    expect(admin.calls.some((c: Call) => c.table === 'organiser_marketing_consents')).toBe(false)
  })
})

describe('withdrawOrganiserConsentByToken', () => {
  const token = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

  it('rejects a malformed token without touching the database', async () => {
    const admin = fakeAdmin()
    const res = await withdrawOrganiserConsentByToken(admin, 'not-a-token', '2026-06-24T00:00:00.000Z')
    expect(res).toBeNull()
    expect(admin.calls.length).toBe(0)
  })

  it('withdraws a granted consent (unsubscribe honoured)', async () => {
    const admin = fakeAdmin({ id: 'c1', status: 'granted', organisation: { name: 'Soundwave' } })
    const res = await withdrawOrganiserConsentByToken(admin, token, '2026-06-24T00:00:00.000Z')
    expect(res).toEqual({ organisationName: 'Soundwave', alreadyWithdrawn: false })
    const update = admin.calls.find((c: Call) => c.op === 'update')
    expect(update).toBeTruthy()
    expect((update!.payload as Record<string, unknown>).status).toBe('withdrawn')
  })

  it('is idempotent: an already-withdrawn consent reports done and does not re-update', async () => {
    const admin = fakeAdmin({ id: 'c1', status: 'withdrawn', organisation: { name: 'Soundwave' } })
    const res = await withdrawOrganiserConsentByToken(admin, token, '2026-06-24T00:00:00.000Z')
    expect(res).toEqual({ organisationName: 'Soundwave', alreadyWithdrawn: true })
    expect(admin.calls.some((c: Call) => c.op === 'update')).toBe(false)
  })

  it('returns null for an unknown token', async () => {
    const admin = fakeAdmin(null)
    const res = await withdrawOrganiserConsentByToken(admin, token, '2026-06-24T00:00:00.000Z')
    expect(res).toBeNull()
  })
})

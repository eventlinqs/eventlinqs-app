import { describe, it, expect } from 'vitest'
import { resolveRefundScope } from '@/lib/payments/refund-scope'

// Minimal supabase-like stub: .from(table).select().eq()...maybeSingle()
function clientFor({ admin, ownerOrg, memberOrg, order }: {
  admin?: unknown; ownerOrg?: unknown; memberOrg?: unknown; order?: unknown
}) {
  return {
    from(table: string) {
      const api = {
        select() { return api },
        eq() { return api },
        in() { return api },
        limit() { return api },
        maybeSingle() {
          if (table === 'orders') return Promise.resolve({ data: order ?? null, error: null })
          if (table === 'admin_users') return Promise.resolve({ data: admin ?? null, error: null })
          if (table === 'organisations') return Promise.resolve({ data: ownerOrg ?? null, error: null })
          if (table === 'organisation_members') return Promise.resolve({ data: memberOrg ?? null, error: null })
          return Promise.resolve({ data: null, error: null })
        },
      }
      return api
    },
  }
}

describe('resolveRefundScope', () => {
  const order = { id: 'o1', organisation_id: 'org1' }

  it('allows a platform admin to refund any order', async () => {
    const c = clientFor({ admin: { id: 'u1', role: 'admin', disabled_at: null }, order })
    await expect(resolveRefundScope(c as never, 'o1', 'u1')).resolves.toMatchObject({
      allowed: true, via: 'admin', organisationId: 'org1',
    })
  })

  it('rejects a disabled admin who is not an org member', async () => {
    const c = clientFor({
      admin: { id: 'u1', role: 'admin', disabled_at: '2026-01-01T00:00:00Z' },
      ownerOrg: { id: 'org1', owner_id: 'someone-else' }, memberOrg: null, order,
    })
    await expect(resolveRefundScope(c as never, 'o1', 'u1')).resolves.toMatchObject({ allowed: false })
  })

  it('allows an organiser who owns the org', async () => {
    const c = clientFor({ ownerOrg: { id: 'org1', owner_id: 'u2' }, order })
    await expect(resolveRefundScope(c as never, 'o1', 'u2')).resolves.toMatchObject({
      allowed: true, via: 'organiser',
    })
  })

  it('allows an org member with a manager role', async () => {
    const c = clientFor({
      ownerOrg: { id: 'org1', owner_id: 'someone-else' },
      memberOrg: { organisation_id: 'org1', user_id: 'u4', role: 'manager' }, order,
    })
    await expect(resolveRefundScope(c as never, 'o1', 'u4')).resolves.toMatchObject({
      allowed: true, via: 'organiser',
    })
  })

  it('rejects a stranger', async () => {
    const c = clientFor({
      ownerOrg: { id: 'org1', owner_id: 'someone-else' }, memberOrg: null, order,
    })
    await expect(resolveRefundScope(c as never, 'o1', 'u3')).resolves.toMatchObject({ allowed: false })
  })

  it('rejects when the order does not exist', async () => {
    const c = clientFor({ order: null })
    await expect(resolveRefundScope(c as never, 'missing', 'u1')).resolves.toMatchObject({
      allowed: false, reason: 'order_not_found',
    })
  })
})

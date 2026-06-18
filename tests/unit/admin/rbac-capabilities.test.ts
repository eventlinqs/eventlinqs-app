import { describe, expect, test } from 'vitest'
import {
  resolveCapabilities,
  can,
  roleCapabilities,
  ALL_CAPABILITIES,
  type AdminCapability,
} from '@/lib/admin/rbac'
import type { AdminRole, AdminSession, AdminUserRow } from '@/lib/admin/types'

/**
 * Proves role-limiting and per-user overrides: a non-super-admin role is
 * correctly restricted to its capability set, grants/revokes tune it, and a
 * super_admin always retains everything (founder override).
 */

function makeSession(role: AdminRole, granted: string[] = [], revoked: string[] = []): AdminSession {
  const admin = {
    role,
    capabilities_granted: granted,
    capabilities_revoked: revoked,
  } as unknown as AdminUserRow
  return {
    userId: 'u',
    email: 'a@b.c',
    admin,
    capabilities: resolveCapabilities(admin),
  }
}

describe('role baselines (the matrix)', () => {
  test('super_admin has every capability', () => {
    expect(new Set(resolveCapabilities(makeSession('super_admin').admin))).toEqual(new Set(ALL_CAPABILITIES))
  })

  test('support is limited to dashboard, audit, profile, refunds', () => {
    expect(resolveCapabilities(makeSession('support').admin).sort()).toEqual(
      ['admin.audit.read', 'admin.dashboard.view', 'admin.profile.read', 'admin.refunds.process'].sort(),
    )
  })

  test('moderator is limited to dashboard, profile, events', () => {
    expect(resolveCapabilities(makeSession('moderator').admin).sort()).toEqual(
      ['admin.dashboard.view', 'admin.events.manage', 'admin.profile.read'].sort(),
    )
  })
})

describe('non-super-admin roles are correctly denied', () => {
  const denials: Array<[AdminRole, AdminCapability]> = [
    ['support', 'admin.pricing.manage'],
    ['support', 'admin.users.manage'],
    ['support', 'admin.events.manage'],
    ['support', 'admin.payouts.disburse'],
    ['support', 'admin.invites.manage'],
    ['moderator', 'admin.pricing.manage'],
    ['moderator', 'admin.payouts.disburse'],
    ['moderator', 'admin.invites.manage'],
    ['moderator', 'admin.refunds.process'],
  ]
  test.each(denials)('%s cannot %s', (role, cap) => {
    expect(can(makeSession(role), cap)).toBe(false)
  })

  test('admin (not super) cannot exceed its set without a grant', () => {
    // admin has invites.manage by default but a revoke must remove it.
    expect(can(makeSession('admin'), 'admin.invites.manage')).toBe(true)
    expect(can(makeSession('admin', [], ['admin.invites.manage']), 'admin.invites.manage')).toBe(false)
  })
})

describe('per-user overrides tune the role', () => {
  test('a grant adds one capability to support', () => {
    const s = makeSession('support', ['admin.events.manage'])
    expect(can(s, 'admin.events.manage')).toBe(true)
    expect(can(s, 'admin.pricing.manage')).toBe(false) // still denied
  })

  test('a revoke removes one capability from moderator', () => {
    const s = makeSession('moderator', [], ['admin.events.manage'])
    expect(can(s, 'admin.events.manage')).toBe(false)
  })

  test('an unknown capability string is ignored', () => {
    const s = makeSession('support', ['totally.bogus'])
    expect(s.capabilities).not.toContain('totally.bogus')
  })
})

describe('super_admin override of everything', () => {
  test('revokes cannot strip a super_admin (founder retains everything)', () => {
    const s = makeSession('super_admin', [], [...ALL_CAPABILITIES])
    for (const cap of ALL_CAPABILITIES) {
      expect(can(s, cap)).toBe(true)
    }
  })
})

describe('roleCapabilities matches resolveCapabilities baseline', () => {
  const roles: AdminRole[] = ['super_admin', 'admin', 'support', 'moderator']
  test.each(roles)('%s baseline is internally consistent', (role) => {
    const baseline = [...roleCapabilities(role)].sort()
    const resolved = resolveCapabilities(makeSession(role).admin).sort()
    expect(resolved).toEqual(baseline)
  })
})

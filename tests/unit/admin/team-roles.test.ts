import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ALL_CAPABILITIES, ROLE_LABELS, can, resolveCapabilities } from '@/lib/admin/rbac'
import { ASSIGNABLE_ADMIN_ROLES } from '@/lib/admin/admin-staff'
import type { AdminRole, AdminSession, AdminUserRow } from '@/lib/admin/types'

/*
 * THE TEAM ROLES AS LAWAL NAMED THEM (law 33 (f), 19 November 2026: 'by the owner or by staff with roles (owner,
 * operations, viewer) ... each action server checked by role and written to an audit log'; the PM's 22:14 item 2).
 */
function session(role: AdminRole): AdminSession {
  const admin = { role, capabilities_granted: [], capabilities_revoked: [] } as unknown as AdminUserRow
  return { userId: 'u', email: 'a@b.c', admin, capabilities: resolveCapabilities(admin) }
}

describe('Owner, Operations, Viewer', () => {
  test('the staff form offers exactly his three, by his names', () => {
    expect(ASSIGNABLE_ADMIN_ROLES).toEqual(['super_admin', 'admin', 'viewer'])
    expect(ASSIGNABLE_ADMIN_ROLES.map((r) => ROLE_LABELS[r])).toEqual(['Owner', 'Operations', 'Viewer'])
  })

  test('the Owner holds everything', () => {
    expect(new Set(session('super_admin').capabilities)).toEqual(new Set(ALL_CAPABILITIES))
  })

  test('a Viewer reads the dashboard, the audit log and their profile, and nothing that writes', () => {
    const v = session('viewer')
    expect([...v.capabilities].sort()).toEqual(['admin.audit.read', 'admin.dashboard.view', 'admin.profile.read'])
    for (const c of ALL_CAPABILITIES.filter((x) => !['admin.audit.read', 'admin.dashboard.view', 'admin.profile.read'].includes(x))) {
      expect(can(v, c), c).toBe(false)
    }
  })

  test('the server refuses any other role on the staff form, and the database knows the Viewer', () => {
    const actions = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/staff/actions.ts'), 'utf8')
    expect(actions).toContain("z.enum(['super_admin', 'admin', 'viewer'])")
    const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20261119230001_admin_role_viewer.sql'), 'utf8')
    expect(migration).toContain("ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'viewer';")
  })
})

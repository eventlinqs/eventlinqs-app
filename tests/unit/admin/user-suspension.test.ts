import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateUserById = vi.fn()
let targetRole = 'attendee'

vi.mock('@/lib/admin/audit', () => ({ recordAuditEvent: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { id: 'u1', email: 'u@test.invalid', role: targetRole }, error: null }),
        }),
      }),
    }),
    auth: { admin: { updateUserById } },
  }),
}))

import { setUserSuspension } from '@/lib/admin/users'

const session = { userId: 'admin1', email: 'admin@x', admin: { role: 'admin' } } as never

beforeEach(() => {
  updateUserById.mockReset().mockResolvedValue({ error: null })
  targetRole = 'attendee'
})

describe('setUserSuspension', () => {
  it('suspends a normal user with a long ban duration', async () => {
    const res = await setUserSuspension({ userId: 'u1', suspend: true }, session)
    expect(res.ok).toBe(true)
    expect(updateUserById).toHaveBeenCalledWith('u1', { ban_duration: '876000h' })
  })

  it('reactivates a user by clearing the ban', async () => {
    const res = await setUserSuspension({ userId: 'u1', suspend: false }, session)
    expect(res.ok).toBe(true)
    expect(updateUserById).toHaveBeenCalledWith('u1', { ban_duration: 'none' })
  })

  it('refuses to suspend a platform admin and makes no auth call', async () => {
    targetRole = 'super_admin'
    const res = await setUserSuspension({ userId: 'u1', suspend: true }, session)
    expect(res.ok).toBe(false)
    expect(updateUserById).not.toHaveBeenCalled()
  })
})

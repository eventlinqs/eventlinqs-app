import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * AUTH-02 proof.
 *
 * The admin gate must assert that the LIVE session completed admin 2FA, not
 * merely that the user is authenticated and has an admin_users row. A Supabase
 * session minted outside the admin login flow (e.g. the public buyer /login
 * page) carries no 2FA proof cookie and must be rejected.
 */

// A 32-byte base64 key so AES-256-GCM seal/open works in the test process.
process.env.ADMIN_TOTP_ENC_KEY = Buffer.alloc(32, 7).toString('base64')

import {
  sealTwoFactorProof,
  isTwoFactorProofValid,
  TWO_FACTOR_COOKIE,
} from '@/lib/admin/two-factor'

describe('AUTH-02: isTwoFactorProofValid (pure)', () => {
  const now = 1_700_000_000_000
  // Freeze Date.now around the proof window.
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
  })

  it('accepts a fresh proof sealed for the same user', () => {
    const token = sealTwoFactorProof('admin-1', now)
    expect(isTwoFactorProofValid(token, 'admin-1')).toBe(true)
  })

  it('rejects a proof sealed for a DIFFERENT user', () => {
    const token = sealTwoFactorProof('admin-1', now)
    expect(isTwoFactorProofValid(token, 'attacker-2')).toBe(false)
  })

  it('rejects an expired proof', () => {
    // Sealed 13h ago; TTL is 12h.
    const token = sealTwoFactorProof('admin-1', now - 13 * 60 * 60 * 1000)
    expect(isTwoFactorProofValid(token, 'admin-1')).toBe(false)
  })

  it('rejects a missing / garbage / tampered token', () => {
    expect(isTwoFactorProofValid(undefined, 'admin-1')).toBe(false)
    expect(isTwoFactorProofValid(null, 'admin-1')).toBe(false)
    expect(isTwoFactorProofValid('not-a-real-token', 'admin-1')).toBe(false)
    const token = sealTwoFactorProof('admin-1', now)
    // Flip the first base64 char (mutates the IV) so AES-GCM auth fails.
    const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1)
    expect(isTwoFactorProofValid(tampered, 'admin-1')).toBe(false)
  })
})

// ---- Gate integration: getAdminSession requires the proof cookie ----

let cookieValue: string | undefined
const adminRow = {
  id: 'admin-1',
  disabled_at: null,
  role: 'super_admin',
  capabilities_granted: [],
  capabilities_revoked: [],
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === TWO_FACTOR_COOKIE && cookieValue ? { value: cookieValue } : undefined),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1', email: 'a@eventlinqs.com' } }, error: null }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: adminRow, error: null }),
        }),
      }),
    }),
  }),
}))

import { getAdminSession } from '@/lib/admin/auth'

describe('AUTH-02: getAdminSession asserts 2FA on the live session', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    cookieValue = undefined
  })

  it('BLOCKS a valid admin session that lacks the 2FA proof cookie', async () => {
    cookieValue = undefined // session minted outside the admin login flow
    const session = await getAdminSession()
    expect(session).toBeNull()
  })

  it('BLOCKS when the proof cookie belongs to a different user', async () => {
    cookieValue = sealTwoFactorProof('someone-else', Date.now())
    const session = await getAdminSession()
    expect(session).toBeNull()
  })

  it('ALLOWS a session carrying a valid 2FA proof for this user', async () => {
    cookieValue = sealTwoFactorProof('admin-1', Date.now())
    const session = await getAdminSession()
    expect(session).not.toBeNull()
    expect(session?.userId).toBe('admin-1')
  })
})

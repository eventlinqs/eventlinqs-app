import { cookies } from 'next/headers'
import { decryptString, encryptString } from './encryption'

/**
 * Admin 2FA session proof (AUTH-02).
 *
 * The admin console uses a custom TOTP second factor (see src/app/admin/
 * actions.ts), not Supabase's native MFA/AAL. That means a Supabase session on
 * its own carries NO signal of whether the admin 2FA step was completed: a
 * session minted by the public buyer `/login` page is, to `auth.getUser()`,
 * indistinguishable from one minted by the admin login flow. Without an extra
 * signal the admin gate would trust any authenticated session for a user that
 * happens to have an admin_users row, bypassing 2FA entirely.
 *
 * This module mints and verifies that missing signal: a tamper-proof,
 * httpOnly cookie issued ONLY after the admin login flow has verified the
 * second factor (or completed first-login enrolment). The admin gate
 * (`getAdminSession`) requires a valid proof bound to the current user, so a
 * session that never passed admin 2FA is rejected.
 *
 * The token is AES-256-GCM sealed with the same key as the TOTP secret
 * (ADMIN_TOTP_ENC_KEY), so it cannot be forged or replayed across users.
 */

export const TWO_FACTOR_COOKIE = 'el_admin_2fa'

// Proof lifetime. Bounds how long a single 2FA verification stays valid before
// the admin must re-authenticate through the full flow.
const TTL_MS = 12 * 60 * 60 * 1000

interface ProofPayload {
  sub: string
  iat: number
  exp: number
}

/** Seal a proof token for `userId`. Exported for unit verification. */
export function sealTwoFactorProof(userId: string, now: number): string {
  const payload: ProofPayload = { sub: userId, iat: now, exp: now + TTL_MS }
  return encryptString(JSON.stringify(payload))
}

/**
 * Pure validator: does `token` prove that THIS `userId` completed admin 2FA and
 * the proof has not expired? Rejects a missing token, a forged/tampered token,
 * a token minted for a different user, and an expired token.
 */
export function isTwoFactorProofValid(token: string | undefined | null, userId: string): boolean {
  if (!token) return false
  let payload: ProofPayload
  try {
    payload = JSON.parse(decryptString(token)) as ProofPayload
  } catch {
    return false
  }
  if (!payload || payload.sub !== userId) return false
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false
  return true
}

/** Issue the proof cookie after a successful admin 2FA verification. */
export async function issueTwoFactorProof(userId: string): Promise<void> {
  const token = sealTwoFactorProof(userId, Date.now())
  const store = await cookies()
  store.set(TWO_FACTOR_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(TTL_MS / 1000),
  })
}

/** Clear the proof cookie (logout). */
export async function clearTwoFactorProof(): Promise<void> {
  const store = await cookies()
  store.delete(TWO_FACTOR_COOKIE)
}

/** Read + validate the proof cookie for `userId` from the current request. */
export async function hasValidTwoFactorProof(userId: string): Promise<boolean> {
  const store = await cookies()
  return isTwoFactorProofValid(store.get(TWO_FACTOR_COOKIE)?.value, userId)
}

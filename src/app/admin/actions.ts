'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAnonAuditEvent, recordAuditEvent } from '@/lib/admin/audit'
import { getAdminSession } from '@/lib/admin/auth'
import { decryptString, encryptString } from '@/lib/admin/encryption'
import {
  generateRecoveryCodes,
  generateTotpSecret,
  verifyRecoveryCode,
  verifyTotp,
} from '@/lib/admin/totp'
import type { AdminUserRow } from '@/lib/admin/types'

/**
 * Server actions for admin authentication and 2FA.
 *
 * Login is a two-factor flow:
 *   step 1: email + password (Supabase auth)
 *   step 2: 6-digit TOTP code OR a single-use recovery code
 *
 * If the admin has not yet enrolled (totp_secret_encrypted is null), step 2
 * is skipped and the user is redirected to /admin/enrol-2fa to bootstrap
 * their authenticator. The first-login bootstrap is the intended path for
 * the seeded super_admin.
 */

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
  recovery: z.string().optional(),
  next: z.string().optional(),
})

export interface LoginResult {
  ok: boolean
  error?: string
  redirectTo?: string
}

export async function loginAdminAction(formData: FormData): Promise<LoginResult> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    totp: formData.get('totp') ?? undefined,
    recovery: formData.get('recovery') ?? undefined,
    next: formData.get('next') ?? undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid email and password.' }
  }

  const { email, password, totp, recovery, next } = parsed.data
  const supa = await createServerSupabase()
  const { data: signed, error: signInErr } = await supa.auth.signInWithPassword({
    email,
    password,
  })
  if (signInErr || !signed.user) {
    await recordAnonAuditEvent({
      action: 'admin.session.login.failure',
      actorEmail: email,
      metadata: { stage: 'password', reason: signInErr?.message ?? 'unknown' },
    })
    return { ok: false, error: 'Invalid email or password.' }
  }

  const adminLookup = await createAdminClient()
    .from('admin_users')
    .select('*')
    .eq('id', signed.user.id)
    .maybeSingle<AdminUserRow>()
  const admin = adminLookup.data
  if (adminLookup.error || !admin) {
    await supa.auth.signOut()
    await recordAnonAuditEvent({
      action: 'admin.session.login.failure',
      actorEmail: email,
      metadata: { stage: 'admin_lookup', reason: 'no admin_users row' },
    })
    return { ok: false, error: 'This account is not authorised for the admin console.' }
  }
  if (admin.disabled_at) {
    await supa.auth.signOut()
    await recordAnonAuditEvent({
      action: 'admin.session.login.failure',
      actorEmail: email,
      metadata: { stage: 'disabled' },
    })
    return { ok: false, error: 'This admin account is disabled.' }
  }

  if (admin.totp_secret_encrypted) {
    const result = await verifySecondFactor({ admin, totp, recovery })
    if (!result.ok) {
      await supa.auth.signOut()
      await recordAnonAuditEvent({
        action: 'admin.session.login.failure',
        actorEmail: email,
        metadata: { stage: '2fa', reason: result.reason },
      })
      return { ok: false, error: result.error }
    }
  }

  await createAdminClient()
    .from('admin_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', admin.id)

  await recordAuditEvent({
    action: 'admin.session.login.success',
    session: { userId: signed.user.id, email, admin },
  })

  if (!admin.totp_secret_encrypted) {
    return { ok: true, redirectTo: '/admin/enrol-2fa' }
  }
  return { ok: true, redirectTo: safeNext(next) }
}

async function verifySecondFactor(args: {
  admin: AdminUserRow
  totp?: string
  recovery?: string
}): Promise<{ ok: true } | { ok: false; reason: string; error: string }> {
  const { admin, totp, recovery } = args

  if (totp) {
    if (!admin.totp_secret_encrypted) {
      return { ok: false, reason: 'no_secret', error: '2FA is not enrolled on this account.' }
    }
    let secret: string
    try {
      secret = decryptString(admin.totp_secret_encrypted)
    } catch {
      return { ok: false, reason: 'decrypt_failed', error: '2FA secret could not be read. Contact a super admin.' }
    }
    if (verifyTotp(totp, secret)) return { ok: true }
    return { ok: false, reason: 'totp_mismatch', error: 'Invalid 2FA code.' }
  }

  if (recovery) {
    const remaining = admin.totp_recovery_codes_hashed ?? []
    const matchIndex = remaining.findIndex(h => verifyRecoveryCode(recovery, h))
    if (matchIndex < 0) {
      return { ok: false, reason: 'recovery_mismatch', error: 'Invalid recovery code.' }
    }
    const next = remaining.filter((_, i) => i !== matchIndex)
    await createAdminClient()
      .from('admin_users')
      .update({ totp_recovery_codes_hashed: next })
      .eq('id', admin.id)
    await recordAuditEvent({
      action: 'admin.totp.recovery_used',
      session: { userId: admin.id, email: '', admin },
      metadata: { remaining: next.length },
    })
    return { ok: true }
  }

  return { ok: false, reason: 'missing', error: 'Enter a 2FA code or recovery code.' }
}

function safeNext(next: string | undefined): string {
  if (!next) return '/admin'
  if (!next.startsWith('/admin')) return '/admin'
  if (next === '/admin/login') return '/admin'
  return next
}

export async function logoutAdminAction(): Promise<void> {
  const session = await getAdminSession()
  const supa = await createServerSupabase()
  if (session) {
    await recordAuditEvent({ action: 'admin.session.logout', session })
  }
  await supa.auth.signOut()
  redirect('/admin/login')
}

// ------------------- 2FA enrolment -------------------

const PrepareSchema = z.object({})

export interface PrepareEnrolResult {
  ok: boolean
  error?: string
  secretBase32?: string
  otpauthUri?: string
  enrolToken?: string
}

/**
 * Phase 1 of enrolment: generate a fresh secret and return it to the page
 * for display. The secret is also encrypted and stashed in a short-lived
 * cookie so the verify step can read it without re-issuing.
 */
export async function prepareTotpEnrolmentAction(): Promise<PrepareEnrolResult> {
  PrepareSchema.parse({})
  const session = await getAdminSession()
  if (!session) return { ok: false, error: 'Not authorised.' }
  if (session.admin.totp_secret_encrypted) {
    return { ok: false, error: 'This account has already enrolled 2FA.' }
  }
  const { secretBase32, otpauthUri } = generateTotpSecret(session.email)
  const enrolToken = encryptString(JSON.stringify({ secret: secretBase32, sub: session.userId, exp: Date.now() + 10 * 60 * 1000 }))
  return { ok: true, secretBase32, otpauthUri, enrolToken }
}

const ConfirmSchema = z.object({
  enrolToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
})

export interface ConfirmEnrolResult {
  ok: boolean
  error?: string
  recoveryCodes?: string[]
}

export async function confirmTotpEnrolmentAction(formData: FormData): Promise<ConfirmEnrolResult> {
  const parsed = ConfirmSchema.safeParse({
    enrolToken: formData.get('enrolToken'),
    code: formData.get('code'),
  })
  if (!parsed.success) {
    return { ok: false, error: 'Enter a 6-digit code from your authenticator.' }
  }
  const session = await getAdminSession()
  if (!session) return { ok: false, error: 'Not authorised.' }
  if (session.admin.totp_secret_encrypted) {
    return { ok: false, error: 'This account has already enrolled 2FA.' }
  }

  let payload: { secret: string; sub: string; exp: number }
  try {
    payload = JSON.parse(decryptString(parsed.data.enrolToken))
  } catch {
    return { ok: false, error: 'Enrolment token expired. Refresh the page and try again.' }
  }
  if (payload.sub !== session.userId) {
    return { ok: false, error: 'Enrolment token does not match the current session.' }
  }
  if (Date.now() > payload.exp) {
    return { ok: false, error: 'Enrolment token expired. Refresh the page and try again.' }
  }
  if (!verifyTotp(parsed.data.code, payload.secret)) {
    return { ok: false, error: 'That code did not match. Try again.' }
  }

  const { plain, hashed } = generateRecoveryCodes()
  const encryptedSecret = encryptString(payload.secret)
  const upd = await createAdminClient()
    .from('admin_users')
    .update({
      totp_secret_encrypted: encryptedSecret,
      totp_enrolled_at: new Date().toISOString(),
      totp_recovery_codes_hashed: hashed,
    })
    .eq('id', session.userId)
  if (upd.error) {
    return { ok: false, error: 'Could not save enrolment. Try again.' }
  }

  await recordAuditEvent({ action: 'admin.totp.enrolled', session })
  return { ok: true, recoveryCodes: plain }
}

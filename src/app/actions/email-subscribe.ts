'use server'

import { trackEventServer } from '@/lib/analytics/plausible'

/**
 * Email signup server action (Batch 9.2 stub).
 *
 * The `email_subscribers` table does not yet exist (no migration in
 * `supabase/migrations/`). The brief authorises a stub action when the
 * table is missing: this implementation validates the email, fires a
 * Plausible server event so the conversion is captured immediately, and
 * returns success to the caller. The DB persistence layer ships with
 * the table migration in 9.2.1.
 *
 * Validation:
 *   - non-empty after trim
 *   - basic email shape (one @, one dot in the domain part, no spaces)
 *   - max length 254 characters per RFC 5321
 *
 * Returns `{ ok: true }` on success or `{ ok: false, error }` on validation
 * failure. The form caller renders the success/error states from this
 * shape.
 */
export interface EmailSubscribeResult {
  ok: boolean
  error?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitEmailSignup(formData: FormData): Promise<EmailSubscribeResult> {
  const raw = formData.get('email')
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Email is required.' }
  }
  const email = raw.trim().toLowerCase()
  if (email.length === 0) return { ok: false, error: 'Email is required.' }
  if (email.length > 254) return { ok: false, error: 'Email is too long.' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email.' }

  // Server-side Plausible event so the conversion is captured even if
  // the client-side analytics call is blocked. trackEventServer is
  // fire-and-forget; never throws.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  void trackEventServer('email_signup_submit_success', `${siteUrl}/`, {
    domain: email.split('@')[1] ?? '',
  })

  // Stub: no DB write yet. The 9.2.1 migration adds the
  // email_subscribers table and this function will start writing rows.
  // For now the success acknowledgement is recorded via Plausible only.
  return { ok: true }
}

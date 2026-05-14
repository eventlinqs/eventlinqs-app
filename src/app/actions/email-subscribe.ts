'use server'

import { createClient } from '@/lib/supabase/server'
import { trackEventServer } from '@/lib/analytics/plausible'

/**
 * Email signup server action (Batch 9.2 stub, 9.2.1 persistence wired).
 *
 * Validates the email and consent flag, then inserts into the
 * `email_subscribers` table (created by the
 * `20260509000001_email_subscribers` migration). Duplicate-email inserts
 * are returned as silent success so the response shape never leaks list
 * membership.
 *
 * Plausible captures the conversion server-side (bypasses ad blockers)
 * with the email's domain (not the local-part) as the only prop, so
 * subscriber identity stays private.
 */
export interface EmailSubscribeResult {
  ok: boolean
  error?: string
  alreadySubscribed?: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitEmailSignup(formData: FormData): Promise<EmailSubscribeResult> {
  const raw = formData.get('email')
  const consent = formData.get('consent') === 'on'

  if (typeof raw !== 'string') {
    return { ok: false, error: 'Email is required.' }
  }
  const email = raw.trim().toLowerCase()
  if (email.length === 0) return { ok: false, error: 'Email is required.' }
  if (email.length > 254) return { ok: false, error: 'Email is too long.' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email.' }
  if (!consent) {
    return { ok: false, error: 'Please confirm you agree to receive updates.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('email_subscribers').insert({
    email,
    consent: true,
    source: 'homepage',
  })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'

  if (error) {
    // 23505 = unique_violation. Duplicate email; silent success so we
    // do not leak list membership to anonymous probers.
    if (error.code === '23505') {
      void trackEventServer('email_signup_submit_duplicate', `${siteUrl}/`, {
        domain: email.split('@')[1] ?? '',
      })
      return { ok: true, alreadySubscribed: true }
    }
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }

  void trackEventServer('email_signup_submit_success', `${siteUrl}/`, {
    domain: email.split('@')[1] ?? '',
  })
  return { ok: true }
}

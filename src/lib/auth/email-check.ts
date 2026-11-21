import type { User } from '@supabase/supabase-js'

/**
 * THE EMAIL CHECK, ONLY WHERE MONEY IS PAID OUT (law 50 (b), Lawal, 21 November 2026, 10:06: "our process should be
 * smooth, fluid, and easy: easy, one-step processes"). Signing up signs the person in at once, so a new account's
 * address is not yet proved to be theirs. That proof is asked once, before an organiser sets up payouts
 * (src/app/api/stripe/connect/onboard/route.ts), never to browse, save, buy or list.
 *
 * An address counts as checked when, in this order:
 *   1. the person pressed a link we emailed to it (app_metadata.email_checked_at, written by /auth/confirm);
 *   2. never while the sign up marked it pending (app_metadata.email_check = 'pending') and no press is recorded;
 *   3. the account was made through a provider that checks the address itself (Google);
 *   4. the account was confirmed by its own emailed link before one step sign up began (every email account then was).
 * Anything else is not checked: the conservative answer where money is concerned.
 */
export const ONE_STEP_SIGNUP_FROM = '2026-11-21T00:00:00.000Z'

export type CheckableUser = Pick<User, 'app_metadata' | 'email_confirmed_at' | 'created_at'>

export function emailIsChecked(user: CheckableUser): boolean {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>
  if (typeof meta.email_checked_at === 'string' && meta.email_checked_at !== '') return true
  if (meta.email_check === 'pending') return false
  const providers = [...(Array.isArray(meta.providers) ? meta.providers : []), meta.provider]
  if (providers.some((p) => typeof p === 'string' && p !== '' && p !== 'email')) return true
  const created = Date.parse(user.created_at)
  return Boolean(user.email_confirmed_at) && Number.isFinite(created) && created < Date.parse(ONE_STEP_SIGNUP_FROM)
}

/** What /auth/confirm writes when a person presses a link emailed to their address: merged into app_metadata. */
export function emailCheckedMetadata(at: Date = new Date()): { email_checked_at: string; email_check: 'done' } {
  return { email_checked_at: at.toISOString(), email_check: 'done' }
}

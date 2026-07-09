'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { isFlagEnabled } from '@/lib/flags'
import {
  CONSENT_VERSION,
  MARKETING_OPT_IN_LABEL,
  OPENING_FIRST,
  WAITLIST_ROLES,
  getWaitlistCities,
  isWaitlistCitySlug,
  joinConsentText,
  type WaitlistRole,
} from '@/lib/waitlist/city-waitlist'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type JoinWaitlistResult =
  | { ok: true; cityName: string; foundingCandidate: boolean; role: WaitlistRole }
  | { ok: false; error: string }

/**
 * Join a city waitlist. Spam Act posture: the submit button IS the express
 * consent to the city-opening notification (its exact wording is stored
 * verbatim), and the marketing opt-in is a separate unticked box stored as its
 * own boolean. Re-joining upserts the same (city, email) row and clears any
 * previous unsubscribe, because the person has re-consented.
 */
export async function joinCityWaitlist(input: {
  citySlug: string
  fullName: string
  email: string
  role: string
  marketingOptIn: boolean
}): Promise<JoinWaitlistResult> {
  if (!(await isFlagEnabled('launch_kit'))) {
    return { ok: false, error: 'The waitlist is not open right now.' }
  }

  const limited = await actionRateLimit('waitlist-join')
  if (!limited.ok) {
    return { ok: false, error: 'Too many attempts. Please try again in a few minutes.' }
  }

  const citySlug = input.citySlug?.trim()
  if (!isWaitlistCitySlug(citySlug)) {
    return { ok: false, error: 'Choose your city from the list.' }
  }
  const city = getWaitlistCities().find(c => c.slug === citySlug)!

  const fullName = input.fullName?.trim() ?? ''
  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, error: 'Enter your name.' }
  }

  const email = (input.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: 'Enter a valid email address.' }
  }

  const role = input.role as WaitlistRole
  if (!(WAITLIST_ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: 'Tell us whether you run events or go to them.' }
  }

  const marketingOptIn = input.marketingOptIn === true
  const consentText =
    joinConsentText(city.name) +
    (marketingOptIn ? ` | Optional updates opt-in ticked: ${MARKETING_OPT_IN_LABEL}` : '')
  const foundingCandidate = (OPENING_FIRST as readonly string[]).includes(citySlug)

  const admin = createAdminClient()
  const { error } = await admin.from('city_waitlist_signups').upsert(
    {
      city_slug: citySlug,
      full_name: fullName,
      email,
      role,
      marketing_opt_in: marketingOptIn,
      consent_text: consentText,
      consent_version: CONSENT_VERSION,
      source: 'waitlist-page',
      founding_candidate: foundingCandidate,
      unsubscribed_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'city_slug,email' },
  )

  if (error) {
    console.error('[waitlist] join failed:', error)
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }

  return { ok: true, cityName: city.name, foundingCandidate, role }
}

/**
 * Token-based, no-login unsubscribe (Spam Act). A deliberate button press,
 * never an on-load side effect, so an email-scanner prefetch can never
 * silently remove anyone. Clears the marketing opt-in with it.
 */
export async function leaveCityWaitlistAction(token: string): Promise<void> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return
  const admin = createAdminClient()
  await admin
    .from('city_waitlist_signups')
    .update({
      unsubscribed_at: new Date().toISOString(),
      marketing_opt_in: false,
      updated_at: new Date().toISOString(),
    })
    .eq('unsubscribe_token', token)
  revalidatePath(`/waitlist/unsubscribe/${token}`)
}

'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { captureException } from '@/lib/observability/sentry'
import {
  recordPlatformDigestConsent,
  withdrawDigestByAnyToken,
  withdrawDigestConsentByEmail,
  withdrawOrganiserConsentByToken,
} from '@/lib/consent/record'

/**
 * Withdraw organiser marketing consent via the per-row unsubscribe token. No
 * login required (Spam Act: unsubscribe must not demand an account). Scoped to
 * the one organiser, so EventLinqs platform updates are untouched. Idempotent.
 */
export async function unsubscribeFromOrganiserAction(token: string): Promise<void> {
  const admin = createAdminClient()
  await withdrawOrganiserConsentByToken(admin, token, new Date().toISOString())
  revalidatePath(`/unsubscribe/${token}`)
}

/**
 * Withdraw the weekly-local-digest consent via its per-row token (Broadcast
 * Layer SPEC 3.2). No login required, one deliberate button press, idempotent.
 *
 * Accepts EITHER token a digest recipient can be carrying: the
 * `marketing_consents` token, or the city waitlist token for a recipient the
 * bridge brought in. Both end at the same suppression record, so one click
 * stops the digest for that address whichever list it arrived on.
 */
export async function unsubscribeFromDigestAction(token: string): Promise<void> {
  const admin = createAdminClient()
  await withdrawDigestByAnyToken(admin, token, new Date().toISOString())
  revalidatePath(`/unsubscribe/digest/${token}`)
}

export type DigestConsentActionResult = { ok: boolean; error?: string }

/**
 * Set the signed-in user's weekly digest consent from the preference centre
 * (SPEC 3.5). Opting in records a fresh express consent (wording, version,
 * source 'account'); opting out withdraws it. Session-authenticated: the
 * user manages only their own address.
 */
export async function setDigestConsentAction(input: {
  optIn: boolean
  citySlug?: string | null
}): Promise<DigestConsentActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: 'Not signed in' }

  const admin = createAdminClient()
  const at = new Date().toISOString()

  if (!input.optIn) {
    const ok = await withdrawDigestConsentByEmail(admin, user.email, at)
    revalidatePath('/account/notifications')
    return ok ? { ok: true } : { ok: false, error: 'Could not save' }
  }

  /*
   * Validate the city against the taxonomy so the FK can never fail.
   *
   * THROUGH THE DOOR, AND THE FAILURE REFUSES THE SAVE RATHER THAN NARROWING IT.
   * This read discarded its error until 21 September 2026, so a dropped socket
   * left `city` null, `citySlug` null, and the consent was written with NO CITY:
   * somebody who chose Geelong filed as having chosen nowhere. A consent row is
   * evidence under the Spam Act and this platform's own rule is that it is never
   * removed, so a wrong one cannot be taken back and a narrower one cannot be
   * widened. The honest answers are a correct record or a refusal to save, never
   * a record the reader would not recognise as their own answer.
   *
   * A genuinely unknown slug still resolves to null, which is the original and
   * correct behaviour: the taxonomy really does not hold it.
   */
  let citySlug: string | null = null
  if (input.citySlug) {
    try {
      const city = await readOrThrow('the digest consent city', () =>
        admin.from('cities').select('slug').eq('slug', input.citySlug as string).maybeSingle(),
      )
      citySlug = city?.slug ?? null
    } catch (error) {
      captureException(error, { where: 'app/actions/consent:setDigestConsentAction' })
      return { ok: false, error: 'Could not save' }
    }
  }

  const ok = await recordPlatformDigestConsent(admin, {
    email: user.email,
    userId: user.id,
    citySlug,
    source: 'account',
    at,
  })
  revalidatePath('/account/notifications')
  return ok ? { ok: true } : { ok: false, error: 'Could not save' }
}

'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { findSubjectByToken } from '@/lib/consent/ledger'
import { recordSuppressionEvent } from '@/lib/consent/ledger'
import { withdrawDigestByAnyToken } from '@/lib/consent/record'
import { normaliseSubjectEmail } from '@/lib/consent/purposes'
import { actionRateLimit } from '@/lib/rate-limit/action'

/**
 * THE TWO RIGHTS THAT COME WITH FACILITATED MARKETING, AS PRODUCT.
 *
 * Australian Privacy Principle 7.6 gives a person the right to ask that their
 * information is not used to facilitate direct marketing BY OTHER
 * ORGANISATIONS, and 7.7 the right to be told the source of their details. Both
 * must be honoured free and within a reasonable period. They are built here
 * rather than added later because retrofitting them means reopening every
 * message template, and because a right nobody can find is not a right.
 *
 * NO LOGIN, EVER. A right you have to create an account to exercise is not one
 * people exercise. The token in the message identifies the address; the page
 * without a token takes the address itself for the stop request, which can only
 * ever REDUCE what is sent, and never displays anything about a person to
 * somebody who cannot prove the address is theirs.
 *
 * Nothing here sends anything.
 */

export type MarketingRightsResult = { ok: boolean; message: string }

const FACILITATION_REASON =
  'the person asked that their details are not used to help other organisations market to them'

/**
 * APP 7.6, by token: stop using these details to facilitate other
 * organisations' marketing. Applied at once, on every channel, free.
 *
 * It deliberately does NOT withdraw the whole consent. Somebody who still wants
 * EventLinqs' own messages and objects only to the facilitation gets exactly
 * what they asked for; the suppression scope is what separates the two.
 */
export async function stopFacilitationByTokenAction(token: string): Promise<void> {
  const admin = createAdminClient()
  const email = await findSubjectByToken(admin, token)
  if (!email) return

  await recordSuppressionEvent(admin, {
    email,
    channel: 'both',
    scope: 'facilitation_by_others',
    reason: FACILITATION_REASON,
    requestSource: 'rights-page',
  })
  revalidatePath(`/marketing/preferences/${token}`)
}

/** The full unsubscribe, from the same page, so one visit can end everything. */
export async function unsubscribeEverythingByTokenAction(token: string): Promise<void> {
  const admin = createAdminClient()
  await withdrawDigestByAnyToken(admin, token, new Date().toISOString())
  revalidatePath(`/marketing/preferences/${token}`)
}

/**
 * APP 7.6, from the privacy page, with no token: the same stop request, keyed
 * by the address typed in.
 *
 * Unverified on purpose, and safe because of what it can do: it can only ever
 * stop mail. It never reveals whether the address is known to the platform,
 * which is why the answer is the same either way, and why the source
 * disclosure is not offered here (see the page copy for how that one is got).
 */
export async function stopFacilitationByEmailAction(
  _previous: MarketingRightsResult | null,
  formData: FormData,
): Promise<MarketingRightsResult> {
  const email = normaliseSubjectEmail(String(formData.get('email') ?? ''))
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { ok: false, message: 'Enter the email address you want us to stop using.' }
  }

  const limited = await actionRateLimit('marketing-rights')
  if (!limited.ok) {
    return { ok: false, message: 'Too many requests from this connection. Try again shortly.' }
  }

  const admin = createAdminClient()
  await recordSuppressionEvent(admin, {
    email,
    channel: 'both',
    scope: 'facilitation_by_others',
    reason: FACILITATION_REASON,
    requestSource: 'rights-page',
  })

  // The same answer whether or not the address was known, because telling a
  // stranger which addresses we hold would be the leak this route exists to
  // avoid.
  return {
    ok: true,
    message:
      'Recorded. That address is not used to promote other organisers, from now on and at no cost.',
  }
}

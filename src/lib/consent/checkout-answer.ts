import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { captureException } from '@/lib/observability/sentry'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { resolveDigestCity } from './digest-city'
import { getCurrentConsentWording, consentFieldsFromWording, recordConsentEvent } from './ledger'
import { FACILITATED_MARKETING_PURPOSE } from './purposes'
import { resolveSend } from './resolver'

type Admin = SupabaseClient<Database>

export type CheckoutMarketingAnswer = 'granted' | 'declined' | 'none'

export interface CheckoutMarketingResult {
  recorded: CheckoutMarketingAnswer
  /** Plain words, so a log line or a test can say why nothing was written. */
  reason: string
}

/**
 * THE ANSWER TO THE ONE MARKETING QUESTION AT CHECKOUT, RECORDED ONCE.
 *
 * There are three purchase paths on this platform and only one of them used to
 * carry this rule, which is exactly how the group booking wrote a consent with
 * no city and put a person who said yes on no send list at all. So the rule
 * lives here, once, and every checkout calls it.
 *
 * WHAT IT RECORDS, AND WHAT IT DELIBERATELY DOES NOT.
 *
 *   ticked      one granted consent event, under the wording record the buyer
 *               actually read, city scoped through the one shared rule.
 *   unticked    one declined event, which is evidence that the question was put
 *               and answered, UNLESS the resolver already permits this address.
 *               A returning buyer who leaves the box alone has not withdrawn
 *               anything: under the Spam Act a withdrawal is a deliberate act
 *               and an untouched checkbox is not one, and the ledger's latest
 *               event wins, so writing that decline would have silently revoked
 *               a live consent.
 *   switch off  nothing at all, either way. The question was not asked, so
 *               there is no answer to record, and a page cached before the
 *               owner closed the question cannot write one.
 *
 * Best effort throughout: a marketing record is never worth somebody's ticket,
 * so every failure is captured and reported rather than thrown into the order.
 */
export async function recordCheckoutMarketingAnswer(
  admin: Admin,
  params: {
    email: string
    ticked: boolean
    captureSurface: string
    eventId: string
    reference?: string | null
    at?: string
  },
): Promise<CheckoutMarketingResult> {
  try {
    if (!(await isFeatureEnabled('audience_capture'))) {
      return { recorded: 'none', reason: 'the marketing question is switched off' }
    }

    const wording = await getCurrentConsentWording(admin, FACILITATED_MARKETING_PURPOSE)
    if (!wording) {
      return { recorded: 'none', reason: 'no wording record could be read, so nothing was asked' }
    }

    const at = params.at ?? new Date().toISOString()
    const citySlug = await resolveDigestCity(admin, params.eventId)

    if (params.ticked) {
      const ok = await recordConsentEvent(admin, {
        ...consentFieldsFromWording(wording),
        email: params.email,
        decision: 'granted',
        captureSurface: params.captureSurface,
        citySlug,
        reference: params.reference ?? null,
        at,
      })
      return ok
        ? { recorded: 'granted', reason: `granted under wording ${wording.version}` }
        : { recorded: 'none', reason: 'the grant could not be written' }
    }

    const live = await resolveSend(admin, {
      email: params.email,
      purpose: FACILITATED_MARKETING_PURPOSE,
      channel: 'email',
    })
    if (live.permitted) {
      return {
        recorded: 'none',
        reason: 'an untouched box is not a withdrawal and this address already has a live consent',
      }
    }

    const ok = await recordConsentEvent(admin, {
      ...consentFieldsFromWording(wording),
      email: params.email,
      decision: 'declined',
      captureSurface: params.captureSurface,
      citySlug,
      reference: params.reference ?? null,
      at,
    })
    return ok
      ? { recorded: 'declined', reason: `asked under wording ${wording.version} and declined` }
      : { recorded: 'none', reason: 'the decline could not be written' }
  } catch (error) {
    captureException(error, { where: 'lib/consent/checkout-answer:recordCheckoutMarketingAnswer' })
    return { recorded: 'none', reason: 'the answer could not be recorded' }
  }
}

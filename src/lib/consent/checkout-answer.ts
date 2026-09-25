import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { captureException } from '@/lib/observability/sentry'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { resolveDigestCity } from './digest-city'
import {
  getCurrentConsentWording,
  consentFieldsFromWording,
  recordConsentEvent,
  type ConsentWordingRecord,
} from './ledger'
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
    /**
     * AQ1. The wording the buyer actually read, when the question was put to
     * them on an EARLIER surface than this one. Omitted means the question was
     * asked here, so the wording in force now is the wording they read.
     *
     * It is passed in rather than re-read because under AQ1's reversal the two
     * moments are different requests, and a wording version published between
     * them would otherwise rewrite what was agreed to.
     */
    wording?: ConsentWordingRecord | null
  },
): Promise<CheckoutMarketingResult> {
  try {
    if (!(await isFeatureEnabled('audience_capture'))) {
      return { recorded: 'none', reason: 'the marketing question is switched off' }
    }

    const wording = params.wording ?? (await getCurrentConsentWording(admin, FACILITATED_MARKETING_PURPOSE))
    if (!wording) {
      return { recorded: 'none', reason: 'no wording record could be read, so nothing was asked' }
    }

    const at = params.at ?? new Date().toISOString()
    const city = await resolveDigestCity(admin, params.eventId)

    if (params.ticked) {
      const ok = await recordConsentEvent(admin, {
        ...consentFieldsFromWording(wording),
        email: params.email,
        decision: 'granted',
        captureSurface: params.captureSurface,
        citySlug: city.city,
        reference: params.reference ?? null,
        at,
      })
      if (!ok) return { recorded: 'none', reason: 'the grant could not be written' }
      /*
       * THE CONSENT IS WRITTEN EITHER WAY, AND AN UNSCOPED ONE SAYS SO.
       *
       * Losing the grant is the worse mistake: the person said yes, and the
       * ledger is the evidence that they did. But a grant whose city could not
       * be read is in no digest send list, so it must not be reported as a clean
       * one. The reason travels back to the caller and the failure itself is
       * already in Sentry from `resolveDigestCityFor`, which is the difference
       * between a gap somebody can find and a person who quietly never hears
       * anything.
       */
      return city.unresolved
        ? {
            recorded: 'granted',
            reason: `granted under wording ${wording.version}, with no city: the city could not be read`,
          }
        : { recorded: 'granted', reason: `granted under wording ${wording.version}` }
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
    /*
     * AN OUTAGE IS NOT A WITHDRAWAL, AND THE LEDGER IS APPEND ONLY.
     *
     * The resolver fails CLOSED, which is right for "may this message go out"
     * and wrong for the question asked three lines above, "does this address
     * already hold a live consent?". Until 21 September 2026 the two answers
     * were the same `permitted: false`, so a dropped socket on the consent read
     * sent an untouched checkbox down the decline branch, and the ledger's
     * latest-event rule turned that into a withdrawal of a live consent that
     * could never be taken back.
     *
     * MEASURED ON TEST, on a returning buyer who touched nothing, with the
     * consent read failing on cue (4 requests, one call and three retries):
     * before, "granted on 14 Sept 2026 under wording v1"; after, "the latest
     * consent event is declined".
     *
     * So a verdict that is not evidence records NOTHING. Nothing is lost by
     * that: a decline is evidence the question was put and answered, the
     * question will be put again on their next purchase, and the alternative is
     * revoking a consent on the strength of a socket.
     */
    if (!live.ledgerWasRead) {
      return {
        recorded: 'none',
        reason: 'the consent ledger could not be read, and an outage is not a withdrawal',
      }
    }

    const ok = await recordConsentEvent(admin, {
      ...consentFieldsFromWording(wording),
      email: params.email,
      decision: 'declined',
      captureSurface: params.captureSurface,
      citySlug: city.city,
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

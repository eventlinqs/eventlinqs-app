'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { getGuestSessionId } from '@/lib/auth/guest-session'
import { getConsentWordingAsAt } from '@/lib/consent/ledger'
import { FACILITATED_MARKETING_PURPOSE } from '@/lib/consent/purposes'
import { recordTicketPageAnswer } from '@/lib/consent/capture-carrier'
import { resolveCapturePlacement } from '@/lib/consent/capture-placement'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { captureException } from '@/lib/observability/sentry'
import { readOrThrow } from '@/lib/supabase/read-or-throw'

const Schema = z.object({
  reservation_id: z.string().uuid(),
  ticked: z.boolean(),
})

export interface CarryDiscoveryConsentResult {
  carried: boolean
  /** Plain words, so a log line or a test can say why nothing was written. */
  reason: string
}

/**
 * CARRY THE TICKET PAGE ANSWER TO THE RESERVATION IT BELONGS TO.
 *
 * AQ1's reversal condition moves the question to the ticket page, where the
 * buyer has not given an address yet. This is the only thing that writes the
 * waiting answer, and the ledger row is still written at the payment step by
 * the one recorder every purchase path already calls.
 *
 * FOUR REFUSALS, because a consent somebody else wrote for you is worse than no
 * consent at all.
 *
 *   1. The question must actually be switched on.
 *   2. The placement must say ticket page. An answer carried while the question
 *      is asked at checkout would be an answer to a question nobody put.
 *   3. The reservation must be ACTIVE. A settled reservation has already had
 *      its consent recorded, and a late write would sit there claiming to be an
 *      answer to a question that was asked and answered.
 *   4. The caller must HOLD the reservation, by signed-in user or by guest
 *      session. Knowing a reservation id is enough to view a checkout on this
 *      platform, which is a deliberate guest-checkout decision, but it is not
 *      enough to put words in somebody's mouth.
 *
 * THE WORDING IS NOT TAKEN FROM THE BROWSER. It is the version in force when
 * the reservation was created, read on the server. A version supplied by the
 * client would let a caller name which sentence they are recorded as having
 * read, and evidence a stranger can choose is not evidence.
 */
export async function carryDiscoveryConsent(input: {
  reservation_id: string
  ticked: boolean
}): Promise<CarryDiscoveryConsentResult> {
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { carried: false, reason: 'the answer was not in a shape we accept' }

  const rl = await actionRateLimit('discovery-consent-carry')
  if (!rl.ok) return { carried: false, reason: 'too many attempts, so the question will be put again' }

  try {
    if (!(await isFeatureEnabled('audience_capture'))) {
      return { carried: false, reason: 'the marketing question is switched off' }
    }

    const admin = createAdminClient()
    if ((await resolveCapturePlacement(admin)) !== 'ticket_page') {
      return { carried: false, reason: 'the question is not asked on the ticket page' }
    }

    /*
     * THROUGH THE DOOR, because the sentence below is a statement about somebody
     * else's reservation. Discarding this error made a dropped socket answer "no
     * such reservation" about a reservation that exists, and dropped the answer
     * the person had just given. The catch at the foot of this function says "the
     * answer could not be carried", which is true, and the question is put again.
     */
    const reservation = await readOrThrow('the reservation behind a carried consent', () =>
      admin
        .from('reservations')
        .select('id, status, user_id, session_id, created_at')
        .eq('id', parsed.data.reservation_id)
        .maybeSingle(),
    )
    if (!reservation) return { carried: false, reason: 'no such reservation' }
    if (reservation.status !== 'active') {
      return { carried: false, reason: 'that reservation is no longer active' }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const sessionId = await getGuestSessionId()
    const holdsIt =
      (reservation.user_id !== null && reservation.user_id === (user?.id ?? null)) ||
      (reservation.session_id !== null && reservation.session_id === sessionId)
    if (!holdsIt) return { carried: false, reason: 'that reservation is not yours' }

    const wording = await getConsentWordingAsAt(
      admin,
      FACILITATED_MARKETING_PURPOSE,
      reservation.created_at,
    )
    if (!wording) {
      return { carried: false, reason: 'no wording record could be read, so nothing was carried' }
    }

    const written = await recordTicketPageAnswer(admin, {
      reservationId: reservation.id,
      ticked: parsed.data.ticked,
      wording,
    })
    return { carried: written.ok, reason: written.reason }
  } catch (error) {
    captureException(error, { where: 'app/actions/discovery-consent:carryDiscoveryConsent' })
    return { carried: false, reason: 'the answer could not be carried' }
  }
}

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { captureException } from '@/lib/observability/sentry'
import { getConsentWordingByVersion, type ConsentWordingRecord } from './ledger'
import { scopesForPurpose, type ConsentChannelScope } from './purposes'
import type { CapturePlacement } from './capture-placement-math'

type Admin = SupabaseClient<Database>

/**
 * THE ANSWER THAT WAS GIVEN BEFORE THE ADDRESS WAS.
 *
 * When the question is asked on the ticket page, the buyer has not typed an
 * email yet, so the consent cannot be written when it is given. It waits here,
 * against the reservation, and is written into the ledger at checkout.
 *
 * THIS IS NOT THE CONSENT RECORD AND MUST NEVER BE READ AS ONE. It is a note in
 * a pocket between two screens. public.consent_events is the evidence, it is
 * append only, and it is what an ACMA complaint is answered from. The carrier
 * dies with its reservation and nothing sends from it.
 *
 * THE WORDING TRAVELS WITH THE ANSWER. A new wording version published between
 * the ticket page and the payment step would otherwise rewrite what the buyer
 * agreed to, which is the one thing the versioned wording record exists to stop.
 */

export interface CarriedAnswer {
  ticked: boolean
  placement: CapturePlacement
  wording: ConsentWordingRecord
  /** True when the scopes came from the declared rules rather than the record. */
  scopesReconstructed: boolean
}

export async function recordTicketPageAnswer(
  admin: Admin,
  params: { reservationId: string; ticked: boolean; wording: ConsentWordingRecord },
): Promise<{ ok: boolean; reason: string }> {
  try {
    const { error } = await admin.from('marketing_capture_answer').insert({
      reservation_id: params.reservationId,
      ticked: params.ticked,
      placement: 'ticket_page' satisfies CapturePlacement,
      wording_purpose: params.wording.purpose,
      wording_version: params.wording.version,
      wording: params.wording.body,
    })
    if (error) {
      /*
       * A duplicate is not a failure. A buyer who goes back and forward through
       * the ticket page can reach this twice for the same reservation, and the
       * FIRST answer is the one they gave against the wording they were shown.
       * The table refuses UPDATE, so there is nothing to overwrite even if a
       * later call wanted to.
       */
      if (error.code === '23505') {
        return { ok: true, reason: 'an answer for this reservation was already carried' }
      }
      return { ok: false, reason: error.message }
    }
    return { ok: true, reason: `carried under wording ${params.wording.version}` }
  } catch (error) {
    captureException(error, { where: 'lib/consent/capture-carrier:recordTicketPageAnswer' })
    return { ok: false, reason: 'the answer could not be carried' }
  }
}

/**
 * The answer waiting for this reservation, or null when none was carried.
 *
 * Null is the ordinary case: it means the question was not asked before the
 * payment step, so the payment step asks it. It is never a reason to skip the
 * question, and the caller is written that way round.
 */
export async function readCarriedAnswer(
  admin: Admin,
  reservationId: string,
): Promise<CarriedAnswer | null> {
  try {
    const { data, error } = await admin
      .from('marketing_capture_answer')
      .select('ticked, placement, wording_purpose, wording_version, wording')
      .eq('reservation_id', reservationId)
      .maybeSingle()
    if (error || !data) return null

    /*
     * THE SCOPES COME FROM THE IMMUTABLE RECORD, read back by the version that
     * was carried. consent_wordings refuses UPDATE and DELETE, so a version is
     * the same row it was when the buyer read it and this cannot widen a
     * consent after the fact.
     *
     * THE SENTENCE COMES FROM THE CARRIER, not from that record, and the two
     * are not the same decision. The record supplies what the consent COVERS;
     * the carrier supplies what the buyer actually READ. Where a record is
     * momentarily unreadable the declared rules for the purpose stand in, which
     * is the same rule every other non-checkout surface captures under, and the
     * caller is told that is what happened.
     */
    const record = await getConsentWordingByVersion(admin, data.wording_purpose, data.wording_version)
    const declared = scopesForPurpose(data.wording_purpose)
    const wording: ConsentWordingRecord = {
      purpose: data.wording_purpose,
      version: data.wording_version,
      label: record?.label ?? '',
      body: data.wording,
      channelScope: (record?.channelScope ?? 'email') as ConsentChannelScope,
      thirdPartyScope: record?.thirdPartyScope ?? declared.thirdPartyScope,
      suppressionScope: record?.suppressionScope ?? declared.suppressionScope,
    }

    return {
      ticked: data.ticked,
      placement: (data.placement === 'ticket_page' ? 'ticket_page' : 'checkout') as CapturePlacement,
      wording,
      scopesReconstructed: record === null,
    }
  } catch (error) {
    captureException(error, { where: 'lib/consent/capture-carrier:readCarriedAnswer' })
    return null
  }
}

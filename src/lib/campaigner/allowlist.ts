import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSend } from '@/lib/consent/resolver'
import { FACILITATED_MARKETING_PURPOSE, type ConsentChannel } from '@/lib/consent/purposes'
import { captureException } from '@/lib/observability/sentry'

/**
 * ADMISSION TO THE ALLOWLIST, WHICH HAPPENS ONCE, FROM A MATCH RUN.
 *
 * The allowlist is not a query. It is a RECORD of a decision taken at a moment,
 * carrying the consent state, the scope, the timestamp and the wording version
 * that were true when somebody was admitted, and the match run they came from.
 * A query re-answers itself every time it runs; a record can be read back six
 * months later and argued with.
 *
 * THE DOOR IS GA1's RESOLVER, and it is asked about every single person. The
 * deciding consent event it names is the evidence copied onto the row, so the
 * allowlist can always say WHICH consent admitted somebody rather than merely
 * that one existed.
 *
 * ADMISSION IS NOT PERMISSION TO SEND. Somebody can withdraw between admission
 * and the next run, so the runner asks the door again at send time. Admission
 * decides who is in the campaign; the door decides whether this message may go
 * out now. Collapsing the two would mean a withdrawal only took effect on the
 * next campaign.
 */

export interface AdmissionResult {
  considered: number
  admitted: number
  alreadyOn: number
  refused: { email: string; reason: string }[]
}

export async function admitMatchRunToAllowlist(params: {
  campaignId: string
  matchRunId: string
  channelCode: ConsentChannel
}): Promise<AdmissionResult> {
  const admin = createAdminClient()
  const result: AdmissionResult = { considered: 0, admitted: 0, alreadyOn: 0, refused: [] }

  const { data: scores, error: scoresError } = await admin
    .from('marketing_match_score')
    .select('audience_member_id')
    .eq('run_id', params.matchRunId)
    .order('rank', { ascending: true })
  if (scoresError) throw new Error(`marketing_match_score read failed: ${scoresError.message}`)

  const memberIds = [...new Set((scores ?? []).map(s => s.audience_member_id))]
  result.considered = memberIds.length
  if (memberIds.length === 0) return result

  const members: { id: string; email: string }[] = []
  for (let i = 0; i < memberIds.length; i += 100) {
    const { data, error } = await admin
      .from('audience_members')
      .select('id, email')
      .in('id', memberIds.slice(i, i + 100))
    if (error) throw new Error(`audience_members read failed: ${error.message}`)
    members.push(...(data ?? []))
  }

  const { data: existing } = await admin
    .from('marketing_recipient_allowlist')
    .select('audience_member_id')
    .eq('campaign_id', params.campaignId)
    .eq('channel_code', params.channelCode)
  const alreadyOn = new Set((existing ?? []).map(r => r.audience_member_id))

  for (const member of members) {
    if (alreadyOn.has(member.id)) {
      result.alreadyOn += 1
      continue
    }

    const verdict = await resolveSend(admin, {
      email: member.email,
      purpose: FACILITATED_MARKETING_PURPOSE,
      channel: params.channelCode,
    })
    if (!verdict.permitted) {
      result.refused.push({ email: member.email, reason: verdict.reason })
      continue
    }

    /*
     * THE EVIDENCE IS COPIED FROM THE EVENT THE RESOLVER NAMED, never from the
     * newest event that happens to match. Those are different rows when
     * somebody has granted, withdrawn and granted again, and only one of them
     * is the consent this admission rests on.
     */
    let scope: string | null = null
    let consentAt: string | null = null
    let wordingVersion: string | null = null
    if (verdict.decidingEventId) {
      const { data: event } = await admin
        .from('consent_events')
        .select('channel_scope, occurred_at, wording_version')
        .eq('id', verdict.decidingEventId)
        .maybeSingle()
      if (event) {
        scope = event.channel_scope
        consentAt = event.occurred_at
        wordingVersion = event.wording_version
      }
    }
    if (!scope || !consentAt || !wordingVersion) {
      // The resolver permitted it and the evidence could not be read back. That
      // is a refusal, not a default: an allowlist row that cannot name its own
      // consent is exactly the row this table exists to make impossible.
      result.refused.push({
        email: member.email,
        reason: 'the consent event that permitted this could not be read back, so nothing was admitted',
      })
      continue
    }

    const { error: insertError } = await admin.from('marketing_recipient_allowlist').insert({
      campaign_id: params.campaignId,
      audience_member_id: member.id,
      channel_code: params.channelCode,
      consent_state: true,
      consent_channel_scope: scope,
      consent_at: consentAt,
      consent_wording_version: wordingVersion,
      match_run_id: params.matchRunId,
    })
    if (insertError) {
      if (insertError.code === '23505') {
        result.alreadyOn += 1
        continue
      }
      // A refusal by the database is the database doing its job, most often the
      // scope check on an SMS channel. It is reported by its own message.
      result.refused.push({ email: member.email, reason: insertError.message })
      captureException(new Error(`allowlist admission refused for ${member.email}: ${insertError.message}`))
      continue
    }
    result.admitted += 1
  }

  return result
}

/** How many people a campaign may reach on one channel right now. */
export async function allowlistSize(campaignId: string, channelCode: string): Promise<number> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('marketing_recipient_allowlist')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('channel_code', channelCode)
  return count ?? 0
}

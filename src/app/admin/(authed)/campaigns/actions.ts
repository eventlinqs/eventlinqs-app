'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { readCampaign } from '@/lib/campaigner/read'
import { runCampaign } from '@/lib/campaigner/run'
import { ReadFailed } from '@/lib/supabase/read-or-throw'
import type { ConsentChannel } from '@/lib/consent/purposes'

export type CampaignActionResult = { ok: boolean; message: string }

/**
 * APPROVE ONE SEGMENT AND ONE MESSAGE.
 *
 * The approval is keyed by the segment fingerprint, so it authorises THIS list
 * on THIS channel and nothing else. The rendered sample the approver was shown
 * is stored beside it, because "I approved the campaign" is not a record of
 * what anybody actually read.
 *
 * It sends nothing. Approving permits a later run to move drafts out of draft;
 * the database refuses the move without this row.
 */
export async function approveSegmentAction(
  _previous: CampaignActionResult | null,
  formData: FormData,
): Promise<CampaignActionResult> {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) {
    return { ok: false, message: 'Your role cannot approve a campaign send.' }
  }

  const campaignId = String(formData.get('campaign_id') ?? '').trim()
  const channelCode = String(formData.get('channel_code') ?? '').trim()
  if (!campaignId || !channelCode) return { ok: false, message: 'Pick a campaign and a channel first.' }

  const view = await readCampaign(campaignId, channelCode)
  if (!view) return { ok: false, message: 'No campaign with that reference.' }
  if (!view.segmentFingerprint) {
    return { ok: false, message: 'This campaign has nobody on its allowlist yet, so there is no segment to approve.' }
  }
  if (!view.preview) {
    return {
      ok: false,
      message: `Nothing can be approved until a message renders: ${view.previewProblem ?? 'the next message could not be rendered'}`,
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('marketing_send_approval').insert({
    campaign_id: campaignId,
    segment_fingerprint: view.segmentFingerprint,
    approver_user_id: session.userId,
    approved_sample: view.preview.subject
      ? `${view.preview.subject}\n\n${view.preview.body}`
      : view.preview.body,
  })
  if (error) {
    if (error.code === '23505') {
      return { ok: true, message: 'This exact segment was already approved, so nothing changed.' }
    }
    return { ok: false, message: `The approval was refused: ${error.message}` }
  }

  await recordAuditEvent({
    action: 'admin.campaigns.approve',
    session,
    metadata: { campaignId, channelCode, segmentFingerprint: view.segmentFingerprint },
  })
  revalidatePath('/admin/campaigns')
  return {
    ok: true,
    message: `Approved for ${view.allowlistSize} people on the ${channelCode} channel. A change to that list needs a fresh approval.`,
  }
}

/**
 * Run the pacing for one campaign, once.
 *
 * The refusals come back as sentences rather than thrown, so the screen can say
 * why nothing happened: the mode is hold, nobody is approved, the event has
 * started, or every step is closed at this many days out.
 */
export async function runCampaignAction(
  _previous: CampaignActionResult | null,
  formData: FormData,
): Promise<CampaignActionResult> {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) {
    return { ok: false, message: 'Your role cannot run a campaign.' }
  }

  const campaignId = String(formData.get('campaign_id') ?? '').trim()
  const channelCode = String(formData.get('channel_code') ?? '').trim()
  if (!campaignId || !channelCode) return { ok: false, message: 'Pick a campaign and a channel first.' }

  /*
   * A READ THE CAMPAIGNER COULD NOT MAKE IS REPORTED AS ITSELF.
   *
   * Every read in `runCampaign` goes through `readOrThrow`, so a database fault
   * arrives here as a `ReadFailed` instead of turning into a false sentence
   * about a person in `marketing_send_skip`. It is answered with words rather
   * than left to the error boundary, because the operator needs to know that
   * NOTHING was recorded, which a generic error page cannot tell them. Nothing
   * is audit-logged for a run that never ran.
   */
  let result
  try {
    result = await runCampaign({ campaignId, channelCode: channelCode as ConsentChannel })
  } catch (error) {
    if (!(error instanceof ReadFailed)) throw error
    return {
      ok: false,
      message:
        'The campaigner could not read what it needs from the database, so nothing was sent and ' +
        'nothing was recorded about anybody. Nobody has been skipped and no reason has been ' +
        'stored against them. Try again.',
    }
  }

  await recordAuditEvent({
    action: 'admin.campaigns.run',
    session,
    metadata: {
      campaignId,
      channelCode,
      mode: result.mode,
      drafted: result.drafted,
      dispatched: result.dispatched,
    },
  })
  revalidatePath('/admin/campaigns')

  const parts = [
    `${result.considered} on the list`,
    `${result.drafted} drafted`,
    `${result.dispatched} dispatched`,
  ]
  if (result.refusedByCap > 0) parts.push(`${result.refusedByCap} refused by the cap`)
  const skipped = result.skipped.reduce((sum, s) => sum + s.count, 0)
  if (skipped > 0) parts.push(`${skipped} skipped`)
  if (!result.approved) parts.push('nothing left draft, because this segment is not approved')
  if (result.mode === 'hold') parts.push('the campaigner is on hold, so nothing was dispatched')

  return {
    ok: result.errors.length === 0,
    message: result.errors.length === 0 ? `${parts.join(', ')}.` : `${parts.join(', ')}. ${result.errors[0]}`,
  }
}

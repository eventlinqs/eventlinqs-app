import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { formatEventDate } from '@/lib/dates/event-time'
import { getSiteUrl } from '@/lib/site-url'
import { trackedLinkPath } from '@/lib/attribution/route-config'
import { readCampaignerConfig, type CampaignerMode } from './config'
import { segmentFingerprint } from './fingerprint'
import { SKIP_SENTENCE, daysRemainingToEvent, planNextSend, type PacingStep, type SkipReason } from './pacing'
import { CampaignRenderError, renderCampaignMessage, unsubscribeUrl } from './render'

/**
 * WHAT THE ADMIN CAMPAIGN VIEW READS.
 *
 * Everything here is turned into a sentence or a number in ONE place, for the
 * reason GA2 gives about its own screen: a page that composes its own wording
 * starts saying something slightly different from the record it describes.
 *
 * THE PREVIEW IS THE REAL RENDER. It calls the same `renderCampaignMessage` the
 * runner calls, with the same values, so "exactly as it will arrive" is a fact
 * rather than a claim. A preview built by a second code path is a preview of a
 * message nobody will receive.
 */

export interface StepScheduleRow {
  stepOrder: number
  channelName: string
  windowSentence: string
  templateKey: string
  isOpenNow: boolean
  gapSentence: string
}

export interface CampaignView {
  id: string
  reference: string
  name: string
  mode: CampaignerMode
  modeSentence: string
  eventTitle: string
  eventDateLabel: string
  daysRemaining: number
  daysRemainingSentence: string
  channelCode: string
  allowlistSize: number
  segmentFingerprint: string | null
  approved: boolean
  approvalSentence: string
  approvedSample: string | null
  volumeCap: number
  capUsed: number
  capSentence: string
  sendCounts: { state: string; count: number }[]
  skipCounts: { reason: string; sentence: string; count: number }[]
  steps: StepScheduleRow[]
  senderIdentity: { fromName: string; replyTo: string; identityLine: string; isVerified: boolean } | null
  preview: { subject: string; body: string; html: string; forStep: string } | null
  previewProblem: string | null
}

export interface CampaignListRow {
  id: string
  reference: string
  name: string
  eventTitle: string
  allowlistSize: number
}

export async function listCampaigns(): Promise<CampaignListRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('marketing_campaign')
    .select('id, reference, name, event_id')
    .order('created_at', { ascending: false })
    .limit(40)
  const rows = data ?? []
  if (rows.length === 0) return []

  const { data: events } = await admin
    .from('events')
    .select('id, title')
    .in('id', rows.map(r => r.event_id))
    // One title per listed campaign, and the list above is capped at 40.
    .limit(40)
  const titles = new Map((events ?? []).map(e => [e.id, e.title]))

  const out: CampaignListRow[] = []
  for (const row of rows) {
    const { count } = await admin
      .from('marketing_recipient_allowlist')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', row.id)
    out.push({
      id: row.id,
      reference: row.reference,
      name: row.name,
      eventTitle: titles.get(row.event_id) ?? 'an event that no longer exists',
      allowlistSize: count ?? 0,
    })
  }
  return out
}

const MODE_SENTENCE: Record<CampaignerMode, string> = {
  test: 'Test mode. Every message is written and rendered in full, then handed to a sink that refuses any address outside the test domain. A real person cannot be reached.',
  live: 'Live. An approved send goes to the real transport and reaches a real person.',
  hold: 'On hold. Every message is written and rendered and none is dispatched. Nothing is lost and nothing leaves.',
}

export async function readCampaign(campaignId: string, channelCode: string): Promise<CampaignView | null> {
  const admin = createAdminClient()
  const config = await readCampaignerConfig()

  const { data: campaign } = await admin
    .from('marketing_campaign')
    .select('id, reference, name, event_id, organisation_id, sequence_id, opening_line, signature, volume_cap')
    .eq('id', campaignId)
    .maybeSingle()
  if (!campaign) return null

  const [{ data: event }, { data: organisation }, { data: channels }] = await Promise.all([
    admin
      .from('events')
      .select('id, title, slug, start_date, timezone, venue_name, venue_city')
      .eq('id', campaign.event_id)
      .maybeSingle(),
    admin.from('organisations').select('id, name').eq('id', campaign.organisation_id).maybeSingle(),
    // The channel code table: email and sms today, and a bound rather than a
    // silent ceiling if a third is ever added.
    admin.from('marketing_channel').select('code, display_name').limit(100),
  ])
  const channelName = new Map((channels ?? []).map(c => [c.code, c.display_name]))

  const now = new Date()
  const daysRemaining = event ? daysRemainingToEvent(event.start_date, now) : Number.NaN

  const { data: stepRows } = await admin
    .from('marketing_sequence_step')
    .select('id, step_order, channel_code, days_remaining_min, days_remaining_max, template_key, min_hours_since_previous_send')
    .eq('sequence_id', campaign.sequence_id ?? '')
    .order('step_order', { ascending: true })
    // A sequence is a handful of steps. The bound is stated, not assumed.
    .limit(200)
  const steps: PacingStep[] = (stepRows ?? []).map(s => ({
    id: s.id,
    stepOrder: s.step_order,
    channelCode: s.channel_code,
    daysRemainingMin: s.days_remaining_min,
    daysRemainingMax: s.days_remaining_max,
    templateKey: s.template_key,
    minHoursSincePreviousSend: s.min_hours_since_previous_send,
  }))

  /*
   * THE WHOLE ALLOWLIST. Its length is the number this screen reports as the
   * size of the send AND the number the segment fingerprint is built from, so
   * a truncated read would approve a sample for a segment that does not exist.
   */
  const allowlist = await readEveryRow('marketing_recipient_allowlist', (from, to) =>
    admin
      .from('marketing_recipient_allowlist')
      .select('id, audience_member_id, consent_channel_scope, match_run_id')
      .eq('campaign_id', campaign.id)
      .eq('channel_code', channelCode)
      .order('admitted_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )

  const runIds = allowlist.map(r => r.match_run_id).filter((v): v is string => Boolean(v))
  const fingerprint =
    allowlist.length > 0
      ? segmentFingerprint({
          matchRunId: runIds.length > 0 ? runIds[runIds.length - 1] : campaign.id,
          channelCode,
          allowlistSize: allowlist.length,
        })
      : null

  const { data: approval } = fingerprint
    ? await admin
        .from('marketing_send_approval')
        .select('id, approved_sample, approved_at')
        .eq('campaign_id', campaign.id)
        .eq('segment_fingerprint', fingerprint)
        .maybeSingle()
    : { data: null }

  // Every send this campaign has made. `capUsed` is counted from these rows,
  // so a short read reports a cap as unspent when it is not.
  const sendRows = await readEveryRow('marketing_send', (from, to) =>
    admin
      .from('marketing_send')
      .select('state, channel_code')
      .eq('campaign_id', campaign.id)
      .order('id', { ascending: true })
      .range(from, to),
  )
  const capUsed = sendRows.filter(s => s.channel_code === channelCode).length
  const stateCounts = new Map<string, number>()
  for (const s of sendRows) stateCounts.set(s.state, (stateCounts.get(s.state) ?? 0) + 1)

  const skips = await readEveryRow('marketing_send_skip', (from, to) =>
    admin
      .from('marketing_send_skip')
      .select('reason')
      .eq('campaign_id', campaign.id)
      .eq('channel_code', channelCode)
      .order('id', { ascending: true })
      .range(from, to),
  )
  const skipCounts = new Map<string, number>()
  for (const s of skips) skipCounts.set(s.reason, (skipCounts.get(s.reason) ?? 0) + 1)

  const { data: identity } = await admin
    .from('marketing_sender_identity')
    .select('id, from_name, reply_to, identity_line, is_verified')
    .eq('organisation_id', campaign.organisation_id)
    .eq('is_verified', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let preview: CampaignView['preview'] = null
  let previewProblem: string | null = null
  try {
    const plan = planNextSend({
      daysRemaining,
      steps,
      recipient: {
        allowlistId: 'preview',
        consentChannelScope: (allowlist[0]?.consent_channel_scope ?? 'both') as 'email' | 'sms' | 'both',
        lastSentAt: null,
        stepIdsAlreadySent: [],
      },
      now,
    })
    if (!plan.queued) {
      previewProblem = SKIP_SENTENCE[plan.reason as SkipReason] ?? plan.reason
    } else if (!event || !organisation) {
      previewProblem = 'This campaign has no event or no organisation, so nothing can be rendered.'
    } else {
      const { data: template } = await admin
        .from('marketing_template')
        .select('key, channel_code, subject_template, body_template')
        .eq('key', plan.step.templateKey)
        .maybeSingle()
      if (!template) {
        previewProblem = 'The next step names a template that does not exist.'
      } else {
        const origin = getSiteUrl()
        const rendered = renderCampaignMessage({
          template: {
            key: template.key,
            channelCode: template.channel_code,
            subjectTemplate: template.subject_template,
            bodyTemplate: template.body_template,
          },
          values: {
            organiser_name: organisation.name,
            event_title: event.title,
            event_date: formatEventDate(event.start_date, event.timezone),
            venue_name: event.venue_name ?? organisation.name,
            venue_city: event.venue_city ?? '',
            days_remaining: String(daysRemaining),
            // A real code shape, never a real code: a preview must not mint a
            // link, because a link minted for a preview would be a link nobody
            // was sent that a click could still arrive on.
            tracked_link: `${origin.replace(/\/+$/, '')}${trackedLinkPath('previewpreview')}`,
            opening_line: campaign.opening_line ?? '',
            signature: campaign.signature ?? '',
          },
          senderIdentity: identity
            ? {
                fromName: identity.from_name,
                replyTo: identity.reply_to,
                identityLine: identity.identity_line,
                isVerified: identity.is_verified,
              }
            : null,
          unsubscribeUrl: unsubscribeUrl(origin, config.unsubscribePath, '00000000-0000-4000-8000-000000000000'),
          destination: 'the next person on the list',
        })
        preview = {
          subject: rendered.subject,
          body: rendered.body,
          html: rendered.html,
          forStep: `step ${plan.step.stepOrder}, ${channelName.get(plan.step.channelCode) ?? plan.step.channelCode}`,
        }
      }
    }
  } catch (error) {
    previewProblem =
      error instanceof CampaignRenderError
        ? error.message
        : `The next message could not be rendered: ${error instanceof Error ? error.message : String(error)}`
  }

  return {
    id: campaign.id,
    reference: campaign.reference,
    name: campaign.name,
    mode: config.mode,
    modeSentence: MODE_SENTENCE[config.mode],
    eventTitle: event?.title ?? 'an event that no longer exists',
    eventDateLabel: event ? formatEventDate(event.start_date, event.timezone) : 'no date',
    daysRemaining,
    daysRemainingSentence:
      !Number.isFinite(daysRemaining) || daysRemaining < 0
        ? 'This event has already started, so nothing is queued for it.'
        : daysRemaining === 1
          ? 'One day until this event.'
          : `${daysRemaining} days until this event.`,
    channelCode,
    allowlistSize: allowlist.length,
    segmentFingerprint: fingerprint,
    approved: Boolean(approval),
    approvalSentence: approval
      ? 'This exact segment and message have been approved, so a run may move messages out of draft.'
      : 'Nobody has approved this segment yet, so every message stays in draft and nothing can be dispatched.',
    approvedSample: (approval as { approved_sample?: string } | null)?.approved_sample ?? null,
    volumeCap: campaign.volume_cap,
    capUsed,
    capSentence: `${capUsed} of ${campaign.volume_cap} used on this channel. The database refuses the send that would exceed it.`,
    sendCounts: [...stateCounts.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count),
    skipCounts: [...skipCounts.entries()]
      .map(([reason, count]) => ({
        reason,
        sentence: SKIP_SENTENCE[reason as SkipReason] ?? reason,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    steps: steps.map(s => ({
      stepOrder: s.stepOrder,
      channelName: channelName.get(s.channelCode) ?? s.channelCode,
      windowSentence:
        s.daysRemainingMin === s.daysRemainingMax
          ? `exactly ${s.daysRemainingMin} days out`
          : `${s.daysRemainingMin} to ${s.daysRemainingMax} days out`,
      templateKey: s.templateKey,
      isOpenNow: daysRemaining >= s.daysRemainingMin && daysRemaining <= s.daysRemainingMax,
      gapSentence:
        s.minHoursSincePreviousSend === 0
          ? 'no minimum gap'
          : `at least ${s.minHoursSincePreviousSend} hours after the previous message`,
    })),
    senderIdentity: identity
      ? {
          fromName: identity.from_name,
          replyTo: identity.reply_to,
          identityLine: identity.identity_line,
          isVerified: identity.is_verified,
        }
      : null,
    preview,
    previewProblem,
  }
}

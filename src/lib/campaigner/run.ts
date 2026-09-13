import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSend } from '@/lib/consent/resolver'
import { FACILITATED_MARKETING_PURPOSE, type ConsentChannel } from '@/lib/consent/purposes'
import { formatEventDate } from '@/lib/dates/event-time'
import { getSiteUrl } from '@/lib/site-url'
import { mintTrackedLink } from '@/lib/attribution/record'
import { trackedLinkPath } from '@/lib/attribution/route-config'
import { captureException } from '@/lib/observability/sentry'
import { readCampaignerConfig, type CampaignerMode } from './config'
import { segmentFingerprint } from './fingerprint'
import {
  SKIP_REASON,
  daysRemainingToEvent,
  planNextSend,
  type PacingStep,
  type SkipReason,
} from './pacing'
import { CampaignRenderError, RENDER_FAILURE, renderCampaignMessage, unsubscribeUrl } from './render'
import { SinkRefusal, transportForMode } from './sink'

/**
 * THE PACING RUNNER. One campaign, one pass.
 *
 * WHAT IT DOES, IN ORDER, AND WHY THE ORDER IS THE DESIGN:
 *
 *   1. Reads the mode ONCE and asks for a transport ONCE. In test mode the only
 *      transport this process holds refuses every address outside the test
 *      domain; in hold mode it holds none at all.
 *   2. Asks GA1's DOOR about every person, again, at send time. Admission to
 *      the allowlist was a decision taken at a moment; somebody can withdraw
 *      between then and now, and a withdrawal that only took effect on the next
 *      campaign would be the exact failure that cost the Commonwealth Bank 7.5
 *      million dollars. A refusal is RECORDED with its reason.
 *   3. Plans the step by days remaining, per person, with the gap and the SMS
 *      scope applied. The arithmetic is pure and lives in pacing.ts.
 *   4. Mints a tracked link per person, so every send is attributable, which is
 *      the whole reason GA3 came first.
 *   5. Renders, and REFUSES to render a message without a verified sender
 *      identity or a working unsubscribe.
 *   6. Writes the send row in DRAFT. A machine-drafted body never enters a
 *      queued state on its own; a person moves it, once, per segment.
 *   7. Moves it out of draft only when an approval exists for this exact
 *      segment fingerprint, and the database refuses the move if one does not.
 *
 * THE CAP IS NOT CHECKED HERE, deliberately. It is a trigger on the insert, and
 * a run that hits it sees the database refuse. Checking it in here as well
 * would make the application the thing being tested instead of the constraint.
 */

export interface CampaignRunResult {
  campaignReference: string
  mode: CampaignerMode
  channelCode: string
  daysRemaining: number
  segmentFingerprint: string | null
  approved: boolean
  considered: number
  drafted: number
  dispatched: number
  refusedByCap: number
  skipped: { reason: string; count: number }[]
  errors: string[]
}

interface AllowlistRow {
  id: string
  audience_member_id: string
  channel_code: string
  consent_channel_scope: 'email' | 'sms' | 'both'
  match_run_id: string | null
}

function countReasons(reasons: string[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
}

export async function runCampaign(params: {
  campaignId: string
  channelCode: ConsentChannel
  now?: Date
}): Promise<CampaignRunResult> {
  const admin = createAdminClient()
  const now = params.now ?? new Date()
  const config = await readCampaignerConfig()
  const transport = transportForMode(config.mode, config.testDomain)

  const { data: campaign, error: campaignError } = await admin
    .from('marketing_campaign')
    .select('id, reference, name, event_id, organisation_id, sequence_id, opening_line, signature, volume_cap')
    .eq('id', params.campaignId)
    .maybeSingle()
  if (campaignError) throw new Error(`marketing_campaign read failed: ${campaignError.message}`)
  if (!campaign) throw new Error(`no campaign ${params.campaignId}`)

  const result: CampaignRunResult = {
    campaignReference: campaign.reference,
    mode: config.mode,
    channelCode: params.channelCode,
    daysRemaining: Number.NaN,
    segmentFingerprint: null,
    approved: false,
    considered: 0,
    drafted: 0,
    dispatched: 0,
    refusedByCap: 0,
    skipped: [],
    errors: [],
  }

  const [{ data: event }, { data: organisation }] = await Promise.all([
    admin
      .from('events')
      .select('id, title, slug, start_date, timezone, venue_name, venue_city')
      .eq('id', campaign.event_id)
      .maybeSingle(),
    admin.from('organisations').select('id, name').eq('id', campaign.organisation_id).maybeSingle(),
  ])
  if (!event || !organisation) throw new Error(`campaign ${campaign.reference} has no event or no organisation`)

  result.daysRemaining = daysRemainingToEvent(event.start_date, now)

  const { data: stepRows } = await admin
    .from('marketing_sequence_step')
    .select('id, step_order, channel_code, days_remaining_min, days_remaining_max, template_key, min_hours_since_previous_send')
    .eq('sequence_id', campaign.sequence_id ?? '')
    .order('step_order', { ascending: true })
  const steps: PacingStep[] = (stepRows ?? []).map(s => ({
    id: s.id,
    stepOrder: s.step_order,
    channelCode: s.channel_code,
    daysRemainingMin: s.days_remaining_min,
    daysRemainingMax: s.days_remaining_max,
    templateKey: s.template_key,
    minHoursSincePreviousSend: s.min_hours_since_previous_send,
  }))

  const { data: identity } = await admin
    .from('marketing_sender_identity')
    .select('id, from_name, reply_to, identity_line, is_verified')
    .eq('organisation_id', campaign.organisation_id)
    .eq('is_verified', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: allowRows } = await admin
    .from('marketing_recipient_allowlist')
    .select('id, audience_member_id, channel_code, consent_channel_scope, match_run_id')
    .eq('campaign_id', campaign.id)
    .eq('channel_code', params.channelCode)
    .order('admitted_at', { ascending: true })
  const allowlist = (allowRows ?? []) as AllowlistRow[]
  result.considered = allowlist.length

  if (allowlist.length === 0) return result

  // The fingerprint the approval is keyed by. The newest match run among the
  // admitted rows identifies the segment; a list admitted from two runs is a
  // different segment from either, and the size is what notices.
  const runIds = allowlist.map(r => r.match_run_id).filter((v): v is string => Boolean(v))
  const matchRunId = runIds.length > 0 ? runIds[runIds.length - 1] : campaign.id
  result.segmentFingerprint = segmentFingerprint({
    matchRunId,
    channelCode: params.channelCode,
    allowlistSize: allowlist.length,
  })

  const { data: approval } = await admin
    .from('marketing_send_approval')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('segment_fingerprint', result.segmentFingerprint)
    .maybeSingle()
  result.approved = Boolean(approval)

  const members = new Map<string, { email: string }>()
  const memberIds = allowlist.map(r => r.audience_member_id)
  for (let i = 0; i < memberIds.length; i += 100) {
    const { data } = await admin.from('audience_members').select('id, email').in('id', memberIds.slice(i, i + 100))
    for (const m of data ?? []) members.set(m.id, { email: m.email })
  }

  // The unsubscribe token GA1 already minted for each address. No second token.
  const tokens = new Map<string, string>()
  const emails = [...members.values()].map(m => m.email)
  for (let i = 0; i < emails.length; i += 100) {
    const { data } = await admin
      .from('marketing_consents')
      .select('email, unsubscribe_token')
      .in('email', emails.slice(i, i + 100))
    for (const row of data ?? []) tokens.set(row.email.toLowerCase(), row.unsubscribe_token)
  }

  const { data: priorSends } = await admin
    .from('marketing_send')
    .select('allowlist_id, sequence_step_id, created_at, state')
    .eq('campaign_id', campaign.id)
  const sentByAllowlist = new Map<string, { stepIds: string[]; last: string | null }>()
  for (const s of priorSends ?? []) {
    const entry = sentByAllowlist.get(s.allowlist_id) ?? { stepIds: [], last: null }
    if (s.sequence_step_id) entry.stepIds.push(s.sequence_step_id)
    if (!entry.last || s.created_at > entry.last) entry.last = s.created_at
    sentByAllowlist.set(s.allowlist_id, entry)
  }

  const templates = new Map<string, { key: string; channelCode: string; subjectTemplate: string; bodyTemplate: string }>()
  {
    const { data } = await admin.from('marketing_template').select('key, channel_code, subject_template, body_template')
    for (const t of data ?? []) {
      templates.set(t.key, {
        key: t.key,
        channelCode: t.channel_code,
        subjectTemplate: t.subject_template,
        bodyTemplate: t.body_template,
      })
    }
  }

  const origin = getSiteUrl()
  const skipReasons: string[] = []

  /*
   * APPROVED DRAFTS GO FIRST, and this is not an optimisation.
   *
   * A run before approval writes drafts, which is the design: a machine-drafted
   * body never enters a queued state on its own. The moment somebody approves,
   * those drafts are the messages they approved, and the per-step uniqueness
   * constraint means a later run will not draft them again. Without this block
   * an approval would authorise a segment whose messages had already been
   * written and could never leave, which is a gate that silently swallows a
   * campaign rather than holding it.
   */
  if (result.approved && transport) {
    const { data: drafts } = await admin
      .from('marketing_send')
      .select('id, channel_code, destination, rendered_subject, rendered_body, rendered_html')
      .eq('campaign_id', campaign.id)
      .eq('channel_code', params.channelCode)
      .eq('segment_fingerprint', result.segmentFingerprint)
      .eq('state', 'draft')
    for (const draft of drafts ?? []) {
      try {
        const delivery = await transport.deliver({
          channelCode: draft.channel_code,
          destination: draft.destination,
          subject: draft.rendered_subject,
          // The STORED message is what was approved. A draft is re-rendered by
          // nobody: re-rendering at dispatch would send something that differs
          // from what is on the approval row, which is the one thing an
          // approval is supposed to pin down.
          body: draft.rendered_body,
          html: draft.rendered_html,
        })
        const { error: moveError } = await admin
          .from('marketing_send')
          .update({
            state: 'sent',
            queued_at: now.toISOString(),
            sent_at: new Date().toISOString(),
            provider_message_id: delivery.providerMessageId,
          })
          .eq('id', draft.id)
        if (moveError) {
          result.errors.push(moveError.message)
          continue
        }
        result.dispatched += 1
      } catch (error) {
        if (error instanceof SinkRefusal) {
          result.errors.push(error.message)
          continue
        }
        result.errors.push(error instanceof Error ? error.message : String(error))
      }
    }
  }

  const recordSkip = async (row: AllowlistRow, stepId: string | null, reason: string, detail?: string) => {
    skipReasons.push(reason)
    const { error } = await admin.from('marketing_send_skip').insert({
      campaign_id: campaign.id,
      allowlist_id: row.id,
      sequence_step_id: stepId,
      channel_code: row.channel_code,
      reason,
      detail: detail ?? null,
    })
    if (error) captureException(new Error(`skip write failed for ${row.id}: ${error.message}`))
  }

  /*
   * NO VERIFIED SENDER IDENTITY, NOTHING RENDERS, AND THE RUN SAYS SO ONCE.
   *
   * The renderer refuses each message individually, correctly, but a campaign
   * whose organiser has not verified an identity would then produce one refusal
   * per recipient and read as forty failures instead of one missing setup step.
   * It is checked once, before the loop, and every recipient is recorded with
   * the same true reason.
   */
  if (!identity) {
    for (const row of allowlist) {
      await recordSkip(row, null, RENDER_FAILURE.SENDER_IDENTITY_MISSING, campaign.reference)
    }
    result.skipped = countReasons(skipReasons)
    return result
  }

  for (const row of allowlist) {
    const member = members.get(row.audience_member_id)
    if (!member) {
      await recordSkip(row, null, 'the audience row this admission points at no longer exists')
      continue
    }

    /*
     * THE DOOR, ASKED AGAIN, AT SEND TIME. This is what makes an unsubscribe
     * taken five minutes ago take effect on this run rather than the next
     * campaign.
     */
    const verdict = await resolveSend(admin, {
      email: member.email,
      purpose: FACILITATED_MARKETING_PURPOSE,
      channel: params.channelCode,
    })
    if (!verdict.permitted) {
      await recordSkip(row, null, 'the consent door refused this message', verdict.reason)
      continue
    }

    const plan = planNextSend({
      daysRemaining: result.daysRemaining,
      steps,
      recipient: {
        allowlistId: row.id,
        consentChannelScope: row.consent_channel_scope,
        lastSentAt: sentByAllowlist.get(row.id)?.last ?? null,
        stepIdsAlreadySent: sentByAllowlist.get(row.id)?.stepIds ?? [],
      },
      now,
    })
    if (!plan.queued) {
      await recordSkip(row, null, plan.reason)
      continue
    }

    const template = templates.get(plan.step.templateKey)
    if (!template) {
      await recordSkip(row, plan.step.id, 'the step names a template that does not exist')
      continue
    }

    try {
      // A GA3 recipient row, so the tracked link is minted FOR this person and
      // the sale it produces can be credited to them.
      const { data: recipient } = await admin
        .from('marketing_recipient')
        .upsert(
          {
            campaign_id: campaign.id,
            audience_member_id: row.audience_member_id,
            channel_code: row.channel_code,
          },
          { onConflict: 'campaign_id,audience_member_id,channel_code' },
        )
        .select('id')
        .single()

      const link = await mintTrackedLink({
        campaignId: campaign.id,
        channelCode: row.channel_code,
        eventSlug: event.slug,
        recipientId: recipient?.id ?? null,
      })

      /*
       * NO TOKEN, NO SEND, ON EITHER CHANNEL. The renderer refuses an EMAIL
       * without an unsubscribe link, which is the legal requirement. The send
       * ROW also carries the token as a not-null column, so an SMS with no
       * token would reach the database as a null and be refused there with a
       * message about a constraint rather than about a person. Refused here, by
       * name, so the reason recorded is the true one.
       */
      const token = tokens.get(member.email.toLowerCase()) ?? null
      if (!token) {
        await recordSkip(
          row,
          plan.step.id,
          RENDER_FAILURE.UNSUBSCRIBE_MISSING,
          'this address has no consent record carrying an unsubscribe token',
        )
        continue
      }

      const rendered = renderCampaignMessage({
        template,
        values: {
          organiser_name: organisation.name,
          event_title: event.title,
          event_date: formatEventDate(event.start_date, event.timezone),
          venue_name: event.venue_name ?? organisation.name,
          venue_city: event.venue_city ?? '',
          days_remaining: String(result.daysRemaining),
          tracked_link: `${origin.replace(/\/+$/, '')}${trackedLinkPath(link.code)}`,
          opening_line: campaign.opening_line ?? '',
          signature: campaign.signature ?? '',
        },
        senderIdentity: {
          fromName: identity.from_name,
          replyTo: identity.reply_to,
          identityLine: identity.identity_line,
          isVerified: identity.is_verified,
        },
        unsubscribeUrl: unsubscribeUrl(origin, config.unsubscribePath, token),
        destination: member.email,
      })

      const { data: send, error: sendError } = await admin
        .from('marketing_send')
        .insert({
          campaign_id: campaign.id,
          allowlist_id: row.id,
          channel_code: row.channel_code,
          sequence_step_id: plan.step.id,
          template_key: template.key,
          link_code: link.code,
          sender_identity_id: identity.id,
          segment_fingerprint: result.segmentFingerprint,
          rendered_subject: rendered.subject,
          rendered_body: rendered.body,
          rendered_html: rendered.html,
          unsubscribe_token: token,
          destination: rendered.destination,
          state: 'draft',
        })
        .select('id')
        .single()

      if (sendError) {
        if (/volume cap/i.test(sendError.message)) {
          result.refusedByCap += 1
          skipReasons.push('the campaign volume cap was reached')
          continue
        }
        if (sendError.code === '23505') {
          skipReasons.push(SKIP_REASON.ALREADY_SENT_THIS_STEP)
          continue
        }
        result.errors.push(sendError.message)
        continue
      }
      result.drafted += 1

      if (!result.approved || !transport) continue

      const delivery = await transport.deliver({
        channelCode: row.channel_code,
        destination: rendered.destination,
        subject: rendered.subject,
        body: rendered.body,
        html: rendered.html,
      })
      const { error: moveError } = await admin
        .from('marketing_send')
        .update({
          state: 'sent',
          queued_at: now.toISOString(),
          sent_at: new Date().toISOString(),
          provider_message_id: delivery.providerMessageId,
        })
        .eq('id', send.id)
      if (moveError) {
        result.errors.push(moveError.message)
        continue
      }
      result.dispatched += 1
    } catch (error) {
      if (error instanceof SinkRefusal) {
        // The refusal IS the protection working. It is reported by name so a
        // drive can assert it rather than infer it from a count.
        result.errors.push(error.message)
        continue
      }
      if (error instanceof CampaignRenderError) {
        await recordSkip(row, plan.step.id, error.reason, error.detail)
        continue
      }
      result.errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  result.skipped = countReasons(skipReasons)
  return result
}

export type { SkipReason }

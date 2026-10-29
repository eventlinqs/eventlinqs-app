'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { fromZonedInputValue, PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { decideRecommendation, enterPieceFigure } from '@/lib/growth/social-report'

/**
 * THE PRESSES ON /admin/growth/social-report (J16, J17, G4): enter a figure Instagram or Facebook reported for a piece
 * that went, and approve or decline a recommendation. Nothing here posts anywhere or changes the planner; an approval
 * is kept as history for a person to act on. Every rule is the database's too (20261028151001).
 */

const PATH = '/admin/growth/social-report'

const back = (campaign: string | null, said: string): never =>
  redirect(`${PATH}?${campaign ? `campaign=${encodeURIComponent(campaign)}&` : ''}said=${encodeURIComponent(said)}`)

async function staff(campaign: string | null) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) back(campaign, 'Your role cannot enter figures or answer recommendations.')
  return session
}

const FigureSchema = z.object({
  campaign: z.string().uuid(),
  piece: z.string().uuid(),
  platform: z.enum(['instagram', 'facebook']),
  metric: z.enum(['reach', 'watch_time_seconds', 'saves', 'shares']),
  value: z.coerce.number().int().min(0).max(1_000_000_000),
  readAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
})

export async function enterFigureAction(formData: FormData): Promise<void> {
  const campaign = typeof formData.get('campaign') === 'string' ? (formData.get('campaign') as string) : null
  const session = await staff(campaign)
  const parsed = FigureSchema.safeParse({
    campaign: formData.get('campaign'),
    piece: formData.get('piece'),
    platform: formData.get('platform'),
    metric: formData.get('metric'),
    value: formData.get('value'),
    readAt: formData.get('readAt'),
  })
  if (!parsed.success) back(campaign, 'That figure could not be read: a whole number, its platform, what it measures and when you read it.')
  const f = parsed.data as z.infer<typeof FigureSchema>
  const done = await enterPieceFigure(createAdminClient(), {
    pieceId: f.piece,
    platform: f.platform,
    metric: f.metric,
    value: f.value,
    readAt: new Date(fromZonedInputValue(f.readAt, PLATFORM_TIME_ZONE)),
    by: session.userId,
  })
  if (done.state === 'refused') back(f.campaign, done.reason)
  await recordAuditEvent({ action: 'admin.growth.social_figure', targetType: 'social_piece', targetId: f.piece, session, metadata: { platform: f.platform, metric: f.metric, value: f.value } })
  revalidatePath(PATH)
  back(f.campaign, 'Kept, with when you read it. The newest read is the figure.')
}

const DecideSchema = z.object({
  campaign: z.string().uuid(),
  rule: z.string().regex(/^[a-z][a-z_]{2,59}$/),
  decision: z.enum(['approved', 'declined']),
})

export async function decideAction(formData: FormData): Promise<void> {
  const campaign = typeof formData.get('campaign') === 'string' ? (formData.get('campaign') as string) : null
  const session = await staff(campaign)
  const parsed = DecideSchema.safeParse({ campaign: formData.get('campaign'), rule: formData.get('rule'), decision: formData.get('decision') })
  if (!parsed.success) back(campaign, 'That answer could not be read.')
  const d = parsed.data as z.infer<typeof DecideSchema>
  const done = await decideRecommendation(createAdminClient(), { campaignId: d.campaign, rule: d.rule, decision: d.decision, by: session.userId, now: new Date() })
  if (done.state === 'refused') back(d.campaign, done.reason)
  await recordAuditEvent({ action: 'admin.growth.social_decision', targetType: 'social_campaign', targetId: d.campaign, session, metadata: { rule: d.rule, decision: d.decision } })
  revalidatePath(PATH)
  back(d.campaign, d.decision === 'approved' ? 'Approved and kept. It changes nothing by itself: plan next week with it in mind.' : 'Declined and kept.')
}

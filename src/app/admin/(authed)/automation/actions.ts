'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * THE AUTOMATION DASHBOARD'S TWO SWITCHES (Lawal's 13:41 of 15 November 2026: each workflow's one-time approval switch
 * and its stop switch, "straight from the dashboard live"). Founder only (admin.flags.manage), every press audited, and
 * the database keeps its own rules: the outreach sender refuses 'live' without a passing SPF, DKIM and DMARC check from
 * the last 7 days, and refuses any change of mode not made by a named person (outreach_sender_goes_live_checked,
 * migration 20261028213001), so a press it refuses comes back in its own words.
 */

const SenderSchema = z.object({ mode: z.enum(['hold', 'live']) })
const SocialSchema = z.object({ on: z.enum(['true', 'false']) })

export async function setSenderModeAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.flags.manage')
  const parsed = SenderSchema.safeParse({ mode: formData.get('mode') })
  if (!parsed.success) redirect('/admin/automation?said=invalid')
  const mode = parsed.data.mode
  const { error } = await createAdminClient().from('outreach_sender').update({ mode, changed_by: session.userId }).eq('id', true)
  await recordAuditEvent({ action: 'admin.automation.sender_mode', targetType: 'outreach_sender', targetId: 'sender', metadata: { mode, refused: error?.message ?? null }, session })
  if (error) redirect(`/admin/automation?said=${encodeURIComponent(`The sender was not changed: ${error.message}`)}`)
  redirect(`/admin/automation?said=${encodeURIComponent(mode === 'live' ? 'The sender is live.' : 'The sender is on hold: nothing leaves.')}`)
}

export async function setSocialAutoPublishAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.flags.manage')
  const parsed = SocialSchema.safeParse({ on: formData.get('on') })
  if (!parsed.success) redirect('/admin/automation?said=invalid')
  const enabled = parsed.data.on === 'true'
  const { error } = await createAdminClient().from('feature_flags').update({ enabled, updated_by: session.userId, updated_at: new Date().toISOString() }).eq('flag', 'social_auto_publish')
  await recordAuditEvent({ action: 'admin.automation.social_auto_publish', targetType: 'feature_flags', targetId: 'social_auto_publish', metadata: { enabled, refused: error?.message ?? null }, session })
  if (error) redirect(`/admin/automation?said=${encodeURIComponent(`Social publishing was not changed: ${error.message}`)}`)
  redirect(`/admin/automation?said=${encodeURIComponent(enabled ? 'Social posts publish by themselves.' : 'Social publishing is stopped: nothing posts.')}`)
}

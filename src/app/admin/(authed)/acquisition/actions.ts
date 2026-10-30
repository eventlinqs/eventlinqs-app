'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmPageChecked, markSent } from '@/lib/outreach/crm'

/**
 * LAWAL's DAILY OUTREACH QUEUE, the one press (the PROJECT MANAGER's 05:00, 31 October 2026): he sent a held message by
 * hand in its own app, having checked their page carries no statement against messages, and this records that check
 * and then that he sent it (crm.ts confirmPageChecked, markSent). The database judges it (outreach_touch_is_lawful
 * keeps the basis relied on beside the message and refuses anything the cadence or a stop forbids), and its words are
 * shown when it refuses. Recording the send is what lets the planner draft the next follow up on the cadence's day.
 * Nothing here sends a message.
 */

const back = (said: string): never => redirect(`/admin/acquisition?said=${encodeURIComponent(said)}#queue`)

const SentSchema = z.object({ touch: z.string().uuid(), checked: z.literal('on') })

export async function markSentAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) back('Your role cannot record outreach.')
  const limited = await actionRateLimit('admin-outreach-sent', session.userId)
  if (!limited.ok) back(`Too many presses in a few minutes. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minute${limited.retryAfterSeconds > 60 ? 's' : ''}.`)
  const parsed = SentSchema.safeParse({ touch: formData.get('touch'), checked: formData.get('checked') })
  if (!parsed.success) back('Tick that you opened their page and it says nothing against messages, then press Sent.')
  const { touch } = parsed.data as z.infer<typeof SentSchema>
  // The no-messages check is his, on the page itself (the CONTROLLER's 05:32 (3)); recorded before the send is.
  const checked = await confirmPageChecked(createAdminClient(), { touchId: touch, by: session.userId })
  if (checked.state === 'refused') back(`Not recorded: ${checked.reason}`)
  const done = await markSent(createAdminClient(), { touchId: touch, sentAt: new Date().toISOString(), sentBy: session.userId })
  if (done.state === 'refused') back(`Not recorded: ${done.reason}`)
  await recordAuditEvent({ action: 'admin.outreach.sent', targetType: 'outreach_touch', targetId: touch, session })
  revalidatePath('/admin/acquisition')
  back('Recorded as sent. Its follow up is drafted on the cadence day.')
}

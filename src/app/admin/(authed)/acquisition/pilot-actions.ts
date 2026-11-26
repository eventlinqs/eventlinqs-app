'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordPilotMessage } from '@/lib/outreach/pilot'

/**
 * A PILOT MESSAGE A PERSON SENT, RECORDED (law 31 narrowed by Lawal at 23:01 on 26 November 2026; the PM's car K lean,
 * item K3). The person sent it on Instagram or Facebook from EventLinqs' account and records it here: the words as sent,
 * on the pilot contact, sent by them, now (src/lib/outreach/pilot.ts). The database judges it again. Nothing here sends.
 */

const PilotSchema = z.object({
  contact: z.string().uuid(),
  body: z.string().min(1).max(4000),
  step: z.enum(['1', '2']),
})

export async function recordPilotMessageAction(formData: FormData): Promise<void> {
  const go = (said: string): never => redirect(`/admin/acquisition?said=${encodeURIComponent(said)}#pilot`)
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) go('Your role cannot record outreach.')
  const limited = await actionRateLimit('admin-outreach-sent', session.userId)
  if (!limited.ok) go(`Too many presses in a few minutes. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minute${limited.retryAfterSeconds > 60 ? 's' : ''}.`)
  const parsed = PilotSchema.safeParse({ contact: formData.get('contact'), body: formData.get('body'), step: formData.get('step') ?? '1' })
  if (!parsed.success) go('Paste the message exactly as you sent it, then press Record as sent.')
  const { contact, body, step } = parsed.data as z.infer<typeof PilotSchema>
  const now = new Date()
  const done = await recordPilotMessage(createAdminClient(), { contactId: contact, body, sentAt: now.toISOString(), sentBy: session.userId, step: step === '2' ? 2 : 1 }, now)
  if (done.state === 'refused') return go(done.reason.startsWith('Not recorded') ? done.reason : `Not recorded: ${done.reason}`)
  await recordAuditEvent({ action: 'admin.outreach.pilot.sent', targetType: 'outreach_touch', targetId: done.value.id, metadata: { contact, step }, session })
  revalidatePath('/admin/acquisition')
  go('Recorded as sent in the social pilot.')
}

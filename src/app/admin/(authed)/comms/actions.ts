'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { graphConfigFromEnv } from '@/lib/outreach/graph'
import { approveAndSend } from '@/lib/comms/approve-and-send'
import { getSiteUrl } from '@/lib/site-url'

/**
 * THE COMMUNICATIONS CENTRE'S TWO PRESSES (law 30, the CRM directive's section 5). APPROVE AND SEND: his words, the
 * gateway's rules, his approval recorded, the reply sent by the platform in the organiser's thread
 * (src/lib/comms/approve-and-send.ts). CLOSE WITHOUT A REPLY: the reply leaves his queue with his name on the decision
 * and nothing is sent. Every press is audited; a refusal comes back in its own words, with each rule it broke.
 */

const ApproveSchema = z.object({
  replyId: z.string().uuid(),
  greetingName: z.string().trim().min(1).max(80),
  body: z.string().min(1).max(5000),
})
const CloseSchema = z.object({ replyId: z.string().uuid() })

const back = (tone: 'ok' | 'refused', said: string) => `/admin/comms?tone=${tone}&said=${encodeURIComponent(said.slice(0, 900))}#decisions`

export async function approveAndSendAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.network.manage')
  const parsed = ApproveSchema.safeParse({ replyId: formData.get('replyId'), greetingName: formData.get('greetingName'), body: formData.get('body') })
  if (!parsed.success) redirect(back('refused', 'The reply needs a greeting name and its words.'))
  const db = createAdminClient()
  const sender = await db.from('outreach_sender').select('from_address').eq('id', true).single()
  const cfg = sender.data ? graphConfigFromEnv(sender.data.from_address as string) : null
  if (!cfg) redirect(back('refused', 'The outreach mailbox is not connected to Graph here, so nothing was sent.'))
  const answer = await approveAndSend(db, cfg, { ...parsed.data, by: session.email || session.userId, origin: getSiteUrl() })
  await recordAuditEvent({
    action: 'admin.comms.approve_and_send',
    targetType: 'outreach_replies',
    targetId: parsed.data.replyId,
    metadata: answer.state === 'sent' ? { sent: true, messageId: answer.messageId, to: answer.to } : { sent: false, reason: answer.reason, problems: answer.problems ?? [] },
    session,
  })
  if (answer.state === 'sent') redirect(back('ok', `Sent to ${answer.to} in their thread; Graph accepted it. ${answer.recorded}.`))
  redirect(back('refused', `Not sent: ${answer.reason}${answer.problems?.length ? `: ${answer.problems.join('; ')}` : ''}`))
}

export async function closeWithoutReplyAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.network.manage')
  const parsed = CloseSchema.safeParse({ replyId: formData.get('replyId') })
  if (!parsed.success) redirect(back('refused', 'No reply was named.'))
  const by = session.email || session.userId
  const { data, error } = await createAdminClient()
    .from('outreach_replies')
    .update({ needs_lawal: false, action_taken: `closed without a reply by ${by} at ${new Date().toISOString()}` })
    .eq('id', parsed.data.replyId)
    .eq('needs_lawal', true)
    .select('id')
    .maybeSingle()
  await recordAuditEvent({ action: 'admin.comms.close_without_reply', targetType: 'outreach_replies', targetId: parsed.data.replyId, metadata: { closed: Boolean(data), refused: error?.message ?? null }, session })
  if (error) redirect(back('refused', `Not closed: ${error.message}`))
  redirect(back('ok', data ? 'Closed without a reply; nothing was sent.' : 'That reply was already answered.'))
}

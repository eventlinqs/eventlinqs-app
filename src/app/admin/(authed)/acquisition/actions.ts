'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { createAdminClient } from '@/lib/supabase/admin'
import { confirmPageChecked, logReply, markSent } from '@/lib/outreach/crm'
import { readTouchVoice } from '@/lib/outreach/daily-queue'
import { approvalProblems, readVoicePolicy, voiceContentHash, type VoicePolicy } from '@/lib/outreach/voice-gate'

/**
 * LAWAL's DAILY OUTREACH QUEUE, the one press (the PROJECT MANAGER's 05:00, 31 October 2026): he sent a held message by
 * hand in its own app, having checked their page carries no statement against messages, and this records that check
 * and then that he sent it (crm.ts confirmPageChecked, markSent). The database judges it (outreach_touch_is_lawful
 * keeps the basis relied on beside the message and refuses anything the cadence or a stop forbids), and its words are
 * shown when it refuses. Recording the send is what lets the planner draft the next follow up on the cadence's day.
 * Nothing here sends a message.
 */


const SentSchema = z.object({
  touch: z.string().uuid(),
  checked: z.literal('on'),
  contentHash: z.string().regex(/^[0-9a-f]{16}$/),
  policyVersion: z.string().regex(/^[0-9a-f]{16}$/),
})

export async function markSentAction(formData: FormData): Promise<void> {
  // Back to the page that pressed Sent: the Command Centre's twenty (/admin/today) or this page; nothing else.
  const fromToday = formData.get('from') === 'today'
  const go = (said: string): never =>
    redirect(fromToday ? `/admin/today?said=${encodeURIComponent(said)}#twenty` : `/admin/acquisition?said=${encodeURIComponent(said)}#queue`)
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) go('Your role cannot record outreach.')
  const limited = await actionRateLimit('admin-outreach-sent', session.userId)
  if (!limited.ok) go(`Too many presses in a few minutes. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minute${limited.retryAfterSeconds > 60 ? 's' : ''}.`)
  const parsed = SentSchema.safeParse({
    touch: formData.get('touch'),
    checked: formData.get('checked'),
    contentHash: formData.get('contentHash'),
    policyVersion: formData.get('policyVersion'),
  })
  if (!parsed.success) go('Tick that you opened their page and it says nothing against messages, then press Sent.')
  const { touch, contentHash, policyVersion } = parsed.data as z.infer<typeof SentSchema>
  // The communication gateway (the CONTROLLER's 08:40): the words stored NOW pass it, and they are exactly the words
  // Lawal was shown, under this policy version, and the press is his. Anything else records nothing.
  const db = createAdminClient()
  let policy: VoicePolicy | null = null
  try {
    policy = readVoicePolicy()
  } catch {
    policy = null
  }
  if (!policy) return go('The voice policy could not be read, so nothing was recorded. Nothing goes until it can be.')
  const voice = await readTouchVoice(db, touch)
  if (!voice) return go('That message is no longer waiting.')
  const blocked = approvalProblems({ contentHash, policyVersion, byFounder: session.admin.role === 'super_admin' }, voice, policy)
  if (blocked.length > 0) go(`Not recorded: ${blocked.join('; ')}.`)
  // The no-messages check is his, on the page itself (the CONTROLLER's 05:32 (3)); recorded before the send is.
  const checked = await confirmPageChecked(db, { touchId: touch, by: session.userId })
  if (checked.state === 'refused') go(`Not recorded: ${checked.reason}`)
  const done = await markSent(db, { touchId: touch, sentAt: new Date().toISOString(), sentBy: session.userId })
  if (done.state === 'refused') go(`Not recorded: ${done.reason}`)
  await recordAuditEvent({
    action: 'admin.outreach.sent',
    targetType: 'outreach_touch',
    targetId: touch,
    metadata: { contentHash: voiceContentHash(voice), policyVersion: policy.version, approvedBy: 'founder' },
    session,
  })
  revalidatePath('/admin/acquisition')
  revalidatePath('/admin/today')
  go('Recorded as sent. Its follow up is drafted on the cadence day.')
}

const REPLY_OUTCOMES = ['yes', 'interested', 'question', 'later', 'no', 'stop', 'bounce'] as const
const ReplySchema = z.object({
  touch: z.string().uuid(),
  outcome: z.enum(REPLY_OUTCOMES),
  wording: z.string().max(5000),
})
/** What is written when he marks an outcome without pasting their words: the fact of the mark, never invented words. */
const NO_WORDING: Record<(typeof REPLY_OUTCOMES)[number], string> = {
  yes: 'Reply marked yes on the Command Centre; their words were not pasted.',
  interested: 'Reply marked interested on the Command Centre; their words were not pasted.',
  question: 'Reply marked as a question on the Command Centre; their words were not pasted.',
  later: 'Reply marked later on the Command Centre; their words were not pasted.',
  no: 'Reply marked no on the Command Centre; their words were not pasted.',
  stop: 'Marked as asking not to be written to again on the Command Centre; their words were not pasted.',
  bounce: 'Marked as bounced on the Command Centre; the bounce was not pasted.',
}

/**
 * WHAT CAME BACK (Lawal's 11:11, item 2: the sequence "stops ... on a reply, an unsubscribe or a bounce he marks"). He
 * marks the outcome of a message he sent; the reply is logged on that message's own contact (crm.ts logReply), and the
 * database does the rest: any reply stops the cadence, a stop joins outreach_unsubscribes, a no or a bounce takes the
 * organiser out of the day. Shares the Sent press's per admin limit (60 in 10 minutes), being the same hand's record.
 * Nothing here sends a message.
 */
export async function logReplyAction(formData: FormData): Promise<void> {
  const fromToday = formData.get('from') === 'today'
  const go = (said: string): never =>
    redirect(fromToday ? `/admin/today?said=${encodeURIComponent(said)}#sent-recently` : `/admin/acquisition?said=${encodeURIComponent(said)}#queue`)
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) go('Your role cannot record outreach.')
  const limited = await actionRateLimit('admin-outreach-sent', session.userId)
  if (!limited.ok) go(`Too many presses in a few minutes. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minute${limited.retryAfterSeconds > 60 ? 's' : ''}.`)
  const parsed = ReplySchema.safeParse({ touch: formData.get('touch'), outcome: formData.get('outcome'), wording: String(formData.get('wording') ?? '') })
  if (!parsed.success) go('Choose what came back, then press Record.')
  const { touch, outcome, wording } = parsed.data as z.infer<typeof ReplySchema>
  const db = createAdminClient()
  // The contact is the sent message's own, read here; the form never names it.
  const t = await db.from('outreach_touches').select('id, contact_id').eq('id', touch).eq('state', 'sent').maybeSingle()
  if (t.error || !t.data) go('That message is not recorded as sent, so nothing was logged.')
  const sent = t.data as { id: string; contact_id: string }
  const done = await logReply(db, {
    contactId: sent.contact_id,
    touchId: sent.id,
    receivedAt: new Date().toISOString(),
    wording: wording.trim() || NO_WORDING[outcome],
    outcome,
    loggedBy: session.userId,
  })
  if (done.state === 'refused') go(`Not recorded: ${done.reason}`)
  await recordAuditEvent({ action: 'admin.outreach.reply', targetType: 'outreach_touch', targetId: touch, metadata: { outcome }, session })
  revalidatePath('/admin/acquisition')
  revalidatePath('/admin/today')
  go(outcome === 'bounce' || outcome === 'stop' || outcome === 'no' ? 'Recorded. Nothing more goes to them.' : 'Recorded. The follow ups stop; the conversation is yours.')
}

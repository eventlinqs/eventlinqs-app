'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { reviewSubmission } from '@/lib/listings/submission-store'
import { selfListSubmission } from '@/lib/listings/self-listing-run'
import { SUBMISSION_REFUSALS } from './reasons'

/**
 * A PERSON'S REVIEW OF AN ORGANISER'S SUBMISSION (release checklist H1). PUBLISH NOW publishes it at once on the
 * person's review (15 November 2026: Lawal's Approve on H2o only marked it accepted for a later import, nothing went
 * live, and the photo guard then refused every deploy): the submission goes back to the self-listing run with the
 * reviewer named, which publishes it with its photo on the organiser's facts and tells the organiser it is live, or holds
 * it with the reason in words (a night already started or already listed). Refuse keeps its reason. Each is written only
 * while the submission still waits, and each is in the audit log with who and when.
 */

const ReviewSchema = z.object({ id: z.string().uuid() })
const RefuseSchema = z.object({ id: z.string().uuid(), reason: z.enum(SUBMISSION_REFUSALS) })

export async function acceptSubmissionAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.events.manage')
  const parsed = ReviewSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) redirect('/admin/submissions?status=invalid')
  const id = parsed.data.id
  // Back to the run's own queue with the person named; the run claims it only while it waits.
  const { data, error } = await createAdminClient()
    .from('listing_submissions')
    .update({ status: 'waiting', reviewed_at: null, checked_at: null, held_because: null, reviewed_by: session.userId })
    .eq('id', id)
    .in('status', ['waiting', 'held'])
    .select('id')
  if (error) redirect(`/admin/submissions?tone=refused&said=${encodeURIComponent(`Nothing was published: ${error.message}`)}`)
  if ((data ?? []).length !== 1) redirect('/admin/submissions?status=gone')
  const out = await selfListSubmission(id, new Date(), { approvedBy: session.userId })
  await recordAuditEvent({ action: 'admin.submissions.accept', targetType: 'listing_submission', targetId: id, metadata: { outcome: out.state, reason: 'reason' in out ? out.reason : null }, session })
  if (out.state === 'published') {
    redirect(`/admin/submissions?tone=ok&said=${encodeURIComponent(`Live now at /events/${out.slug}, with its photo; its organiser is told it is live.`)}`)
  }
  redirect(`/admin/submissions?tone=refused&said=${encodeURIComponent(`Not published: ${out.reason}`)}`)
}

export async function refuseSubmissionAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.events.manage')
  const parsed = RefuseSchema.safeParse({ id: formData.get('id'), reason: formData.get('reason') })
  if (!parsed.success) redirect('/admin/submissions?status=invalid')
  const done = await reviewSubmission(createAdminClient(), parsed.data.id, session.userId, { status: 'refused', because: parsed.data.reason })
  if (done !== 'done') redirect(`/admin/submissions?status=${done}`)
  await recordAuditEvent({
    action: 'admin.submissions.refuse',
    targetType: 'listing_submission',
    targetId: parsed.data.id,
    metadata: { reason: parsed.data.reason },
    session,
  })
  redirect('/admin/submissions?status=refused')
}

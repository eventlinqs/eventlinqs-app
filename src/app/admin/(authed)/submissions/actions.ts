'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { reviewSubmission } from '@/lib/listings/submission-store'
import { SUBMISSION_REFUSALS } from './reasons'

/**
 * A PERSON'S REVIEW OF AN ORGANISER'S SUBMISSION (release checklist H1). Accept marks it for the next checked listings
 * file, which the import publishes as it does every listing; refuse keeps its reason. Each is written only while the
 * submission still waits, and each is in the audit log with who and when.
 */

const ReviewSchema = z.object({ id: z.string().uuid() })
const RefuseSchema = z.object({ id: z.string().uuid(), reason: z.enum(SUBMISSION_REFUSALS) })

export async function acceptSubmissionAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.events.manage')
  const parsed = ReviewSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) redirect('/admin/submissions?status=invalid')
  const done = await reviewSubmission(createAdminClient(), parsed.data.id, session.userId, { status: 'accepted' })
  if (done !== 'done') redirect(`/admin/submissions?status=${done}`)
  await recordAuditEvent({ action: 'admin.submissions.accept', targetType: 'listing_submission', targetId: parsed.data.id, session })
  redirect('/admin/submissions?status=accepted')
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

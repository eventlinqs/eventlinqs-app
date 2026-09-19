'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapturePlacement, recordPlacementDecision } from '@/lib/consent/capture-placement'

const MoveSchema = z.object({
  placement: z.string().refine(isCapturePlacement, 'unknown placement'),
  reason: z.string().trim().min(10, 'a placement needs a reason somebody can argue with'),
})

/**
 * MOVE THE DISCOVERY QUESTION. AQ1'S REVERSAL CONDITION, AS A CONTROL.
 *
 * "a conversion fall greater than two percent moves the capture off checkout,
 * it does not remove it". A reversal that needs a deploy is not a reversal, and
 * one that needs a hand written SQL statement is a founder step Law 10 says to
 * script. This is that control: one form, one row appended, audit logged.
 *
 * IT APPENDS AND NEVER EDITS, which the database also enforces. The measurement
 * on the same page reads this log to decide what "before" and "after" mean, so
 * a placement that could be edited afterwards would let somebody move the line
 * a rate was measured either side of.
 *
 * THE REASON IS REQUIRED AND IS NOT DECORATION. The whole value of the log six
 * months from now is being able to ask why the question moved, and a blank
 * reason is refused by the database as well as here.
 */
export async function moveCaptureAskAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.network.manage')

  const parsed = MoveSchema.safeParse({
    placement: formData.get('placement'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) {
    redirect('/admin/audience?placement=invalid')
  }

  const placement = parsed.data.placement
  if (!isCapturePlacement(placement)) {
    redirect('/admin/audience?placement=invalid')
    return
  }

  const written = await recordPlacementDecision(createAdminClient(), {
    placement,
    reason: parsed.data.reason,
    decidedBy: session.userId,
  })

  await recordAuditEvent({
    action: 'admin.audience.capture_placement_moved',
    session,
    targetType: 'marketing_capture_placement',
    metadata: { placement, reason: parsed.data.reason, written: written.ok, why: written.reason },
  })

  redirect(`/admin/audience?placement=${written.ok ? 'moved' : 'error'}`)
}

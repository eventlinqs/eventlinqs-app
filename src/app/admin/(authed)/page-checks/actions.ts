'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { stopPageCheck } from '@/lib/outreach/page-checks'

/**
 * STOP ONE OF THE ENGINE'S PAGE CHECKS (law 43; Lawal, 21 November 2026, 01:05: "You see each one in the morning report
 * and can stop any"). Kept on the check, never deleted; the contact unticked; any letter of theirs waiting goes back to
 * held. Role checked on the server and written to the audit log (law 33 (f)).
 */
export async function stopPageCheckAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  const back = (said: string) => redirect(`/admin/page-checks?said=${encodeURIComponent(said)}`)
  if (!can(session, 'admin.network.manage')) back('Your role cannot stop a page check.')
  const id = String(formData.get('id') ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) back('Nothing was stopped: no check was named.')
  const reason = String(formData.get('reason') ?? '').trim() || 'stopped by a person from /admin/page-checks'
  const answer = await stopPageCheck(createAdminClient(), { id, by: session.userId, reason, now: new Date() })
  await recordAuditEvent({ action: 'admin.page_checks.stop', targetType: 'organiser_page_checks', targetId: id, metadata: { ...answer, reason }, session })
  revalidatePath('/admin/page-checks')
  if (answer.state === 'stopped') back(`Stopped. The contact is unticked; ${answer.held} waiting letter(s) went back to held.`)
  back(`Not stopped: ${answer.reason}.`)
}

'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { removeGig, setReportStatus } from '@/lib/admin/marketplace'

const ReportActionSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(['reviewed', 'dismissed', 'actioned']),
})

export async function setReportStatusAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.marketplace.manage')
  const parsed = ReportActionSchema.safeParse({
    reportId: formData.get('reportId'),
    status: formData.get('status'),
  })
  if (!parsed.success) redirect('/admin/marketplace?status=invalid')
  await setReportStatus(parsed.data, session)
  revalidatePath('/admin/marketplace')
  redirect('/admin/marketplace?status=saved')
}

const RemoveGigSchema = z.object({
  gigId: z.string().uuid(),
  reason: z.string().max(280).default(''),
})

export async function removeGigAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.marketplace.manage')
  const parsed = RemoveGigSchema.safeParse({
    gigId: formData.get('gigId'),
    reason: formData.get('reason') ?? '',
  })
  if (!parsed.success) redirect('/admin/marketplace?status=invalid')
  await removeGig(parsed.data, session)
  revalidatePath('/admin/marketplace')
  redirect('/admin/marketplace?status=saved')
}

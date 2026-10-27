'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { markEnquiry, savePartner, setPartnerStatus } from '@/lib/partners/partners'

/** The admin's presses on /admin/partners (Train C, row 14): a partner record made, put live or back to draft, and an enquiry marked. */

const back = (said: string) => redirect(`/admin/partners?said=${encodeURIComponent(said)}`)

async function session() {
  const s = await requireAdminSession()
  if (!can(s, 'admin.network.manage')) back('Your role cannot change partners.')
  return s
}

export async function savePartnerAction(formData: FormData): Promise<void> {
  const s = await session()
  const field = (k: string) => String(formData.get(k) ?? '')
  const done = await savePartner(createAdminClient(), {
    slug: field('slug'),
    name: field('name'),
    kind: field('kind'),
    summary: field('summary'),
    websiteUrl: field('website'),
    by: s.userId,
  })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.partner.create', session: s, metadata: { slug: field('slug') } })
  revalidatePath('/admin/partners')
  back('Saved as a draft. Put it live when its page reads right.')
}

export async function partnerStatusAction(formData: FormData): Promise<void> {
  const s = await session()
  const id = String(formData.get('id') ?? '')
  const status = formData.get('status') === 'live' ? 'live' : 'draft'
  const ok = await setPartnerStatus(createAdminClient(), id, status)
  if (!ok) back('Nothing was changed just now. Try again in a minute.')
  await recordAuditEvent({ action: 'admin.partner.status', session: s, targetType: 'partner', targetId: id, metadata: { status } })
  revalidatePath('/admin/partners')
  revalidatePath('/partners')
  back(status === 'live' ? 'Live. Its page is public now, labelled Partner.' : 'Back to draft. Its page is no longer public.')
}

export async function enquiryStatusAction(formData: FormData): Promise<void> {
  const s = await session()
  const id = String(formData.get('id') ?? '')
  const status = formData.get('status') === 'closed' ? 'closed' : 'answered'
  const ok = await markEnquiry(createAdminClient(), id, status, s.userId)
  if (!ok) back('Nothing was changed just now. Try again in a minute.')
  await recordAuditEvent({ action: 'admin.partner_enquiry.status', session: s, targetType: 'partner_enquiry', targetId: id, metadata: { status } })
  revalidatePath('/admin/partners')
  back(status === 'answered' ? 'Marked answered.' : 'Closed.')
}

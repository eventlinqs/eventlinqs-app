'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { approveVenuePhoto, refuseVenuePhoto, venueMediaDeps } from '@/lib/venues/venue-images'

/**
 * LAWAL APPROVES A VENUE PHOTOGRAPH ONCE (the project manager's 16:42 and 16:52 of 30 October 2026, G). Approval checks
 * it shows the venue, keeps its quality score and, on the one-tap path, makes it the venue's primary photograph, which
 * then serves every night there. A refusal keeps its reason. The database decides each (venue_image_approve,
 * venue_image_refuse, staff only), and each is in the audit log with who and when.
 */

const ApproveSchema = z.object({
  id: z.string().uuid(),
  quality: z.coerce.number().int().min(0).max(100),
  primary: z.enum(['yes', 'no']),
})
const RefuseSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(200) })

const BACK = '/admin/venues/photos'

export async function approveVenuePhotoAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')
  const parsed = ApproveSchema.safeParse({ id: formData.get('id'), quality: formData.get('quality'), primary: formData.get('primary') })
  if (!parsed.success) redirect(`${BACK}?status=invalid`)
  const done = await approveVenuePhoto(
    { adminId: session.userId, imageId: parsed.data.id, quality: parsed.data.quality, primary: parsed.data.primary === 'yes' },
    venueMediaDeps(),
  )
  if (done.state === 'refused') redirect(`${BACK}?status=refused&why=${encodeURIComponent(done.reason)}`)
  await recordAuditEvent({
    action: 'admin.venues.photo.approve',
    targetType: 'venue_image',
    targetId: parsed.data.id,
    metadata: { quality: parsed.data.quality, primary: parsed.data.primary === 'yes' },
    session,
  })
  redirect(`${BACK}?status=approved`)
}

export async function refuseVenuePhotoAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')
  const parsed = RefuseSchema.safeParse({ id: formData.get('id'), reason: formData.get('reason') })
  if (!parsed.success) redirect(`${BACK}?status=invalid`)
  const done = await refuseVenuePhoto({ adminId: session.userId, imageId: parsed.data.id, reason: parsed.data.reason }, venueMediaDeps())
  if (done.state === 'refused') redirect(`${BACK}?status=refused&why=${encodeURIComponent(done.reason)}`)
  await recordAuditEvent({
    action: 'admin.venues.photo.refuse',
    targetType: 'venue_image',
    targetId: parsed.data.id,
    metadata: { reason: parsed.data.reason },
    session,
  })
  redirect(`${BACK}?status=photo-refused`)
}

'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { decide, findAndKeep } from '@/lib/places/venue-google-admin'

/**
 * A person's three presses on /admin/venues/google-photos: Find (Google is asked, through the cost guard, which place
 * is this venue), Approve (after looking at its current Google photo) and Refuse (with the reason). Each is audited.
 */

const BACK = '/admin/venues/google-photos'
const Id = z.object({ id: z.string().uuid() })
const Refuse = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(300) })

export async function findVenueOnGoogleAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')
  const parsed = Id.safeParse({ id: formData.get('id') })
  if (!parsed.success) redirect(`${BACK}?status=invalid`)
  const found = await findAndKeep(createAdminClient(), parsed.data.id)
  await recordAuditEvent({ action: 'admin.venues.google_place.find', targetType: 'venue', targetId: parsed.data.id, metadata: { state: found.state }, session })
  // Google's name and address are shown once, to the person who pressed Find, and never stored (src/lib/places/venue-google-admin.ts).
  const why =
    found.state === 'stopped' ? found.reason
    : found.state === 'no match' ? found.refused.join(' | ') || 'Google found nothing near'
    : `Google's place: ${found.evidence.name}, ${found.evidence.address}, ${found.evidence.metres} m from our point`
  redirect(`${BACK}?status=${encodeURIComponent(found.state)}&venue=${parsed.data.id}${why ? `&why=${encodeURIComponent(why.slice(0, 400))}` : ''}`)
}

export async function approveVenueGoogleAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')
  const parsed = Id.safeParse({ id: formData.get('id') })
  if (!parsed.success) redirect(`${BACK}?status=invalid`)
  await decide(createAdminClient(), parsed.data.id, session.userId, { approve: true })
  await recordAuditEvent({ action: 'admin.venues.google_place.approve', targetType: 'venue', targetId: parsed.data.id, session })
  redirect(`${BACK}?status=approved&venue=${parsed.data.id}`)
}

export async function refuseVenueGoogleAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.venues.manage')
  const parsed = Refuse.safeParse({ id: formData.get('id'), reason: formData.get('reason') })
  if (!parsed.success) redirect(`${BACK}?status=invalid`)
  await decide(createAdminClient(), parsed.data.id, session.userId, { approve: false, reason: parsed.data.reason })
  await recordAuditEvent({ action: 'admin.venues.google_place.refuse', targetType: 'venue', targetId: parsed.data.id, metadata: { reason: parsed.data.reason }, session })
  redirect(`${BACK}?status=refused&venue=${parsed.data.id}`)
}

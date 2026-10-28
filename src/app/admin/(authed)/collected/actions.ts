'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { assertCan } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { providerOf } from '@/lib/events/booking-links'
import { REFUSAL_REASONS } from './reasons'

/**
 * A PERSON'S REVIEW OF WHAT THE COLLECTION RUN FOUND (item 19: "everything reviewed before publishing").
 *
 * Accept on a candidate that adds links writes them to the event as curated links (WI3's event_booking_links; the
 * database picks the button and never lets a curated link be the organiser's own). Accept on a new listing marks it
 * for the import (scripts/ops/import-city-listings.mjs), which publishes every listing. Refuse says why. Each is
 * written only while the candidate still waits, so two people pressing at once review it once.
 */

const ReviewSchema = z.object({ id: z.string().uuid() })
const RefuseSchema = z.object({ id: z.string().uuid(), reason: z.enum(REFUSAL_REASONS) })

type Link = { url: string; availability: 'on_sale' | 'not_yet' | 'sold_out' | 'dead'; priceFromCents: number | null }

export async function acceptCandidateAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.events.manage')
  const parsed = ReviewSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) redirect('/admin/collected?status=invalid')

  const db = createAdminClient()
  const { data: c, error } = await db
    .from('listing_candidates')
    .select('id, kind, event_id, links, found_at, status')
    .eq('id', parsed.data.id)
    .maybeSingle()
  if (error || !c || c.status !== 'waiting') redirect('/admin/collected?status=gone')

  if (c.kind === 'adds_links' && c.event_id) {
    const { data: held, error: herr } = await db.from('event_booking_links').select('url, position').eq('event_id', c.event_id)
    if (herr) redirect('/admin/collected?status=error')
    const urls = new Set((held ?? []).map((l) => l.url as string))
    let position = Math.max(-1, ...(held ?? []).map((l) => Number(l.position))) + 1
    const rows = (c.links as Link[])
      .filter((l) => !urls.has(l.url))
      .map((l) => ({
        event_id: c.event_id as string,
        provider: providerOf(l.url),
        url: l.url,
        kind: l.availability === 'sold_out' ? 'sold_out' : l.availability === 'not_yet' ? 'presale' : 'tickets',
        availability: l.availability,
        price_from_cents: l.priceFromCents,
        price_checked_at: l.priceFromCents === null ? null : (c.found_at as string),
        set_by: 'curated',
        position: position++,
      }))
    if (rows.length > 0) {
      const { error: lerr } = await db.from('event_booking_links').insert(rows)
      if (lerr) redirect('/admin/collected?status=error')
    }
  }

  const { data: done, error: uerr } = await db
    .from('listing_candidates')
    .update({ status: 'accepted', reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('status', 'waiting')
    .select('id')
  if (uerr || !done || done.length === 0) redirect('/admin/collected?status=gone')
  await recordAuditEvent({ action: 'admin.collected.accept', targetType: 'listing_candidate', targetId: parsed.data.id, session })
  redirect('/admin/collected?status=accepted')
}

export async function refuseCandidateAction(formData: FormData): Promise<void> {
  const session = await requireAdminSession()
  assertCan(session, 'admin.events.manage')
  const parsed = RefuseSchema.safeParse({ id: formData.get('id'), reason: formData.get('reason') })
  if (!parsed.success) redirect('/admin/collected?status=invalid')

  const { data: done, error } = await createAdminClient()
    .from('listing_candidates')
    .update({ status: 'refused', refused_because: parsed.data.reason, reviewed_by: session.userId, reviewed_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('status', 'waiting')
    .select('id')
  if (error || !done || done.length === 0) redirect('/admin/collected?status=gone')
  await recordAuditEvent({
    action: 'admin.collected.refuse',
    targetType: 'listing_candidate',
    targetId: parsed.data.id,
    metadata: { reason: parsed.data.reason },
    session,
  })
  redirect('/admin/collected?status=refused')
}

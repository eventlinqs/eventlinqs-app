'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processEventImage } from '@/lib/media/image-pipeline'
import { MAX_IMAGE_BYTES } from '@/lib/media/limits'
import { checkRateLimit } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'
import { canManageOrganisationSeating } from '@/lib/organisations/access'

/**
 * View from seat, by PHOTOGRAPH (item 9): the organiser uploads one real
 * photo per section of a seating chart; the buyer map shows the actual
 * view on tap. Reuses the proven media pipeline end to end: magic-byte
 * format detection, dimension caps and EXIF stripping in
 * processEventImage; per-user rate limiting; ownership scoped through the
 * seating organisation gate; storage paths under the uploader's user id.
 */

const BUCKET = 'section-views'

export type SectionViewResult =
  | { ok: true; photo_url: string }
  | { ok: false; error: string }

/**
 * The caller may manage this chart: chart -> venue -> the organisation that owns it
 * -> may this caller manage that organisation.
 *
 * The direction matters. This used to resolve the caller's ONE organisation first
 * and require the chart's organisation to equal it, which (a) returned null for any
 * owner of more than one, because the resolver used maybeSingle, and (b) could never
 * accept a chart belonging to their second business even once that was fixed.
 */
async function callerOwnsChart(
  userId: string,
  seatMapId: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: map } = await admin
    .from('seat_maps')
    .select('id, venue_id, venues:venue_id(organisation_id)')
    .eq('id', seatMapId)
    .maybeSingle()
  const venueOrg = (map?.venues as { organisation_id?: string | null } | null)?.organisation_id
  if (!map || !venueOrg) return { ok: false }
  return { ok: await canManageOrganisationSeating(supabase, userId, venueOrg) }
}

export async function uploadSectionViewPhoto(formData: FormData): Promise<SectionViewResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const policy = POLICIES['media-upload']
  const rl = await checkRateLimit({
    key: `${policy.keyPrefix}:${user.id}`,
    limit: policy.limit,
    windowSec: policy.windowSec,
  })
  if (!rl.ok) return { ok: false, error: 'You are uploading too quickly. Wait a moment and try again.' }

  const file = formData.get('file')
  const seatMapId = formData.get('seat_map_id')
  const sectionName = formData.get('section_name')
  if (
    !(file instanceof File) ||
    typeof seatMapId !== 'string' || !seatMapId ||
    typeof sectionName !== 'string' || !sectionName.trim()
  ) {
    return { ok: false, error: 'Something went wrong with that upload. Please try again.' }
  }
  if (file.size === 0) return { ok: false, error: 'That file is empty. Choose a photo and try again.' }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Image must be under 10MB.' }

  const owns = await callerOwnsChart(user.id, seatMapId)
  if (!owns.ok) return { ok: false, error: 'You do not have permission to edit this chart.' }

  let processed
  try {
    const bytes = await file.arrayBuffer()
    const result = await processEventImage(bytes, { role: 'gallery' })
    if (!result.ok) return { ok: false, error: result.error }
    processed = result.image
  } catch (err) {
    console.error('[section-view] image processing failed:', err)
    return { ok: false, error: 'We could not process that image. Try a different file.' }
  }

  const admin = createAdminClient()
  const sectionSlug = sectionName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  const objectName = `${user.id}/${seatMapId}/${sectionSlug}-${Date.now()}.${processed.ext}`
  const { error: storageError } = await admin.storage
    .from(BUCKET)
    .upload(objectName, processed.buffer, {
      cacheControl: '31536000',
      upsert: false,
      contentType: processed.contentType,
    })
  if (storageError) {
    console.error('[section-view] storage error:', storageError)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }
  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(objectName)

  // One photo per section: replace in place (the unique index is
  // case-insensitive on the section name).
  const { data: existing } = await admin
    .from('seat_section_views')
    .select('id, photo_url')
    .eq('seat_map_id', seatMapId)
    .ilike('section_name', sectionName.trim())
    .maybeSingle()

  if (existing) {
    const { error } = await admin
      .from('seat_section_views')
      .update({ photo_url: urlData.publicUrl, created_by: user.id })
      .eq('id', existing.id)
    if (error) return { ok: false, error: 'Could not save the photo. Please try again.' }
    removeStoredObject(existing.photo_url)
  } else {
    const { error } = await admin.from('seat_section_views').insert({
      seat_map_id: seatMapId,
      section_name: sectionName.trim(),
      photo_url: urlData.publicUrl,
      created_by: user.id,
    })
    if (error) return { ok: false, error: 'Could not save the photo. Please try again.' }
  }

  return { ok: true, photo_url: urlData.publicUrl }
}

export async function removeSectionViewPhoto(
  seatMapId: string,
  sectionName: string,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'You must be signed in.' }

  const owns = await callerOwnsChart(user.id, seatMapId)
  if (!owns.ok) return { error: 'You do not have permission to edit this chart.' }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('seat_section_views')
    .select('id, photo_url')
    .eq('seat_map_id', seatMapId)
    .ilike('section_name', sectionName.trim())
    .maybeSingle()
  if (!existing) return { ok: true }

  const { error } = await admin.from('seat_section_views').delete().eq('id', existing.id)
  if (error) return { error: 'Could not remove the photo. Please try again.' }
  removeStoredObject(existing.photo_url)
  return { ok: true }
}

/** Best-effort storage cleanup, scoped to this bucket's public URL shape. */
function removeStoredObject(url: string): void {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return
  const path = decodeURIComponent(url.slice(i + marker.length))
  const admin = createAdminClient()
  void admin.storage
    .from(BUCKET)
    .remove([path])
    .then(({ error }) => {
      if (error) console.error('[section-view] stale object cleanup failed:', error)
    })
}

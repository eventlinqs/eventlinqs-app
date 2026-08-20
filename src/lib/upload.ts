'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { processEventImage } from '@/lib/media/image-pipeline'
import { MAX_IMAGE_BYTES } from '@/lib/media/limits'
import { checkRateLimit } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'

// The single source for organiser event-image I/O. Every cover and gallery image
// flows through uploadEventImage (validate -> normalise -> store); removal flows
// through deleteEventImage / cleanupEventMedia. No fork, no second pipeline.
//
// Security (SPEC 1.5):
//   - identity verified server-side; an EXISTING event must belong to the caller,
//     a not-yet-created event (new wizard) is scoped to the caller's user-id path
//   - per-user upload rate limit
//   - magic-byte + dimension + SVG validation and EXIF strip in the image pipeline
//   - storage writes are scoped to `${user.id}/${eventId}/...`, deletes are scoped
//     to the caller's own user-id namespace
//   - re-encode for DELIVERY stays with /_next/image (MEDIA-ARCHITECTURE)

const BUCKET = 'event-images'

export type UploadedImage = {
  url: string
  /** blurDataURL placeholder for next/image. */
  blur: string
  width: number
  height: number
}

export type UploadImageResult =
  | { ok: true; image: UploadedImage }
  | { ok: false; error: string }

/**
 * True when the caller may attach media to `eventId`. A not-yet-created event
 * (no row) is allowed because the storage path is scoped to the caller's user id.
 * An existing event must be owned or co-managed by the caller (mirrors the
 * updateEvent ownership gate) so an organiser cannot push media onto another
 * org's event via the service-role storage client.
 */
async function callerCanWriteEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const { data: ev } = await supabase
    .from('events')
    .select('organisation_id, created_by')
    .eq('id', eventId)
    .maybeSingle()
  if (!ev) return true
  if (ev.created_by === userId) return true
  const [{ data: owned }, { data: member }] = await Promise.all([
    supabase.from('organisations').select('id').eq('id', ev.organisation_id).eq('owner_id', userId).maybeSingle(),
    supabase
      .from('organisation_members')
      .select('role')
      .eq('organisation_id', ev.organisation_id)
      .eq('user_id', userId)
      .in('role', ['owner', 'admin', 'manager'])
      .maybeSingle(),
  ])
  return !!owned || !!member
}

export async function uploadEventImage(formData: FormData): Promise<UploadImageResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in to upload images.' }

  const policy = POLICIES['media-upload']
  const rl = await checkRateLimit({
    key: `${policy.keyPrefix}:${user.id}`,
    limit: policy.limit,
    windowSec: policy.windowSec,
  })
  if (!rl.ok) {
    return { ok: false, error: 'You are uploading too quickly. Wait a moment and try again.' }
  }

  const file = formData.get('file')
  const eventId = formData.get('eventId')
  const roleRaw = formData.get('role')
  if (!(file instanceof File) || typeof eventId !== 'string' || !eventId) {
    return { ok: false, error: 'Something went wrong with that upload. Please try again.' }
  }
  const role: 'cover' | 'gallery' = roleRaw === 'cover' ? 'cover' : 'gallery'

  if (file.size === 0) return { ok: false, error: 'That file is empty. Choose a photo and try again.' }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Image must be under 10MB.' }

  if (!(await callerCanWriteEvent(supabase, user.id, eventId))) {
    return { ok: false, error: 'You do not have permission to add media to this event.' }
  }

  let processed
  try {
    const bytes = await file.arrayBuffer()
    const result = await processEventImage(bytes, { role })
    if (!result.ok) return { ok: false, error: result.error }
    processed = result.image
  } catch (err) {
    console.error('[upload] image processing failed:', err)
    return { ok: false, error: 'We could not process that image. Try a different file.' }
  }

  const admin = createAdminClient()
  const objectName = `${user.id}/${eventId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${processed.ext}`
  const { error } = await admin.storage.from(BUCKET).upload(objectName, processed.buffer, {
    cacheControl: '31536000',
    upsert: false,
    contentType: processed.contentType,
  })
  if (error) {
    console.error('[upload] storage error:', error)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(objectName)
  return {
    ok: true,
    image: { url: data.publicUrl, blur: processed.blurDataURL, width: processed.width, height: processed.height },
  }
}

export type GeneratedCoverPreviewResult =
  | { ok: true; dataUrl: string; width: number; height: number }
  | { ok: false; error: string }

/**
 * Render a DESIGNED COVER from the event's own details and hand it back as a
 * preview. Nothing is stored and nothing is attached to the event.
 *
 * WHY IT EXISTS. A cover is required to publish, and most small organisers have
 * no artwork. Without an escape hatch inside the product, the requirement locks
 * out exactly the people the platform is for. Law 6 already prescribes the
 * answer for the no-artwork case: a typographic composition built from the
 * organiser's own event details. This action renders THAT composition, the same
 * one the Launch Kit gives them, at the event cover frame.
 *
 * IT RETURNS BYTES, NOT A URL, ON PURPOSE. The organiser sees the cover before
 * anything is committed, and the bytes they approve are the bytes that get
 * uploaded, through the ordinary upload path above. So there is no orphaned
 * storage object for a cover somebody looked at and declined, and no second
 * pipeline: an accepted generated cover is validated, EXIF-stripped and stored
 * exactly like a photograph they chose themselves.
 *
 * Same gate and same rate limit as uploadEventImage, for the same reasons: the
 * caller must be able to write this event, and rendering is expensive enough
 * that it cannot be free to call in a loop.
 */
export async function generateEventCoverPreview(input: {
  eventId: string
  organisationId?: string | null
  title?: string | null
  startLocal?: string | null
  venueName?: string | null
  venueCity?: string | null
}): Promise<GeneratedCoverPreviewResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in to make a cover.' }

  const policy = POLICIES['media-upload']
  const rl = await checkRateLimit({
    key: `${policy.keyPrefix}:cover:${user.id}`,
    limit: policy.limit,
    windowSec: policy.windowSec,
  })
  if (!rl.ok) {
    return { ok: false, error: 'You are making covers too quickly. Wait a moment and try again.' }
  }

  if (!input.eventId) {
    return { ok: false, error: 'Add your event details first, then make a cover.' }
  }
  if (!(await callerCanWriteEvent(supabase, user.id, input.eventId))) {
    return { ok: false, error: 'You do not have permission to change this event.' }
  }
  if (!input.title?.trim()) {
    return { ok: false, error: 'Add your event name first. The cover is built from it.' }
  }

  // The trading name is read through the CALLER's own client, so row-level
  // security is the membership check: an organisation they do not belong to
  // simply does not come back, and a name they do not own cannot be printed
  // onto artwork by passing an id.
  let organiserName: string | null = null
  if (input.organisationId) {
    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', input.organisationId)
      .maybeSingle()
    organiserName = org?.name ?? null
  }

  try {
    const { renderGeneratedCover } = await import('@/lib/events/generated-cover')
    const bytes = await renderGeneratedCover(input.eventId, undefined, {
      title: input.title,
      startLocal: input.startLocal,
      venueName: input.venueName,
      venueCity: input.venueCity,
      organiserName,
    })
    if (!bytes) return { ok: false, error: 'We could not make a cover from those details yet.' }
    return {
      ok: true,
      dataUrl: `data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}`,
      width: 1440,
      height: 1080,
    }
  } catch (err) {
    console.error('[upload] cover generation failed:', err)
    return { ok: false, error: 'We could not make a cover just now. Try again in a moment.' }
  }
}

/** Parse the in-bucket object path from a public storage URL, or null. */
function objectPathFromUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  try {
    return decodeURIComponent(url.slice(i + marker.length))
  } catch {
    return url.slice(i + marker.length)
  }
}

/**
 * Remove a single stored image (organiser removed/replaced it in the editor).
 * Scoped to the caller's own user-id namespace so a URL cannot be used to delete
 * another user's object. Best-effort: a failed delete never breaks the form.
 */
export async function deleteEventImage(url: string): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }
  const path = objectPathFromUrl(url)
  if (!path || !path.startsWith(`${user.id}/`)) return { ok: false }
  const admin = createAdminClient()
  const { error } = await admin.storage.from(BUCKET).remove([path])
  return { ok: !error }
}

/**
 * Orphan cleanup for a whole event (called when an event is deleted). Removes
 * every stored object the event referenced (parsed from its cover + gallery URLs)
 * AND sweeps the `${createdBy}/${eventId}/` prefix, so nothing is left behind
 * regardless of which team member uploaded it. Best-effort and idempotent.
 */
export async function cleanupEventMedia(input: {
  eventId: string
  createdBy: string
  urls: string[]
}): Promise<void> {
  const admin = createAdminClient()
  const paths = new Set<string>()
  for (const u of input.urls) {
    const p = objectPathFromUrl(u)
    if (p) paths.add(p)
  }
  // Sweep the creator's event prefix for anything the URL list missed.
  try {
    const prefix = `${input.createdBy}/${input.eventId}`
    const { data: listed } = await admin.storage.from(BUCKET).list(prefix, { limit: 100 })
    for (const obj of listed ?? []) paths.add(`${prefix}/${obj.name}`)
  } catch (err) {
    console.error('[upload] cleanup list failed:', err)
  }
  if (paths.size === 0) return
  const { error } = await admin.storage.from(BUCKET).remove([...paths])
  if (error) console.error('[upload] cleanup remove failed:', error)
}

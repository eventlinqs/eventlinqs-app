'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { processOrganisationLogo } from '@/lib/media/logo-pipeline'
import { MAX_IMAGE_BYTES } from '@/lib/media/limits'
import { checkRateLimit } from '@/lib/redis/rate-limit'
import { POLICIES } from '@/lib/rate-limit/policies'

/**
 * ORGANISER LOGO I/O.
 *
 * `organisations.logo_url` has existed in the schema and been READ in four
 * places for as long as the organiser profile has, and was written in none of
 * them: no surface in the product ever collected it. So a promoter's poster
 * carried our wordmark where their own Canva one carried theirs.
 *
 * Security posture is inherited from the event-image path, unchanged:
 * identity verified server-side, ownership of the organisation checked, the
 * per-user upload rate limit applied, magic-byte validation and EXIF strip in
 * the pipeline, storage writes scoped to the caller's own user-id namespace.
 */

const BUCKET = 'event-images'

export type LogoUploadResult =
  | {
      ok: true
      url: string
      width: number
      height: number
      placement: 'on-navy' | 'on-tile'
      hasAlpha: boolean
    }
  | { ok: false; error: string }

/** The caller must OWN the organisation to change its mark. */
async function callerOwnsOrganisation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string,
): Promise<boolean> {
  const { data: owned } = await supabase
    .from('organisations')
    .select('id')
    .eq('id', organisationId)
    .eq('owner_id', userId)
    .maybeSingle()
  if (owned) return true
  const { data: member } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('organisation_id', organisationId)
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .maybeSingle()
  return !!member
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

export async function uploadOrganisationLogo(formData: FormData): Promise<LogoUploadResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in to upload a logo.' }

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
  const organisationId = formData.get('organisationId')
  if (!(file instanceof File) || typeof organisationId !== 'string' || !organisationId) {
    return { ok: false, error: 'Something went wrong with that upload. Please try again.' }
  }
  if (file.size === 0) return { ok: false, error: 'That file is empty. Choose your logo and try again.' }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Your logo must be under 10MB.' }

  if (!(await callerOwnsOrganisation(supabase, user.id, organisationId))) {
    return { ok: false, error: 'You do not have permission to change this logo.' }
  }

  let processed
  try {
    const result = await processOrganisationLogo(await file.arrayBuffer())
    if (!result.ok) return { ok: false, error: result.error }
    processed = result.logo
  } catch (err) {
    console.error('[logo] processing failed:', err)
    return { ok: false, error: 'We could not read that image. Try a different file.' }
  }

  const admin = createAdminClient()
  const objectName = `${user.id}/organisation/${organisationId}/${Date.now()}-logo.png`
  const { error: storeError } = await admin.storage.from(BUCKET).upload(objectName, processed.buffer, {
    cacheControl: '31536000',
    upsert: false,
    contentType: processed.contentType,
  })
  if (storeError) {
    console.error('[logo] storage error:', storeError)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }

  const { data: publicUrl } = admin.storage.from(BUCKET).getPublicUrl(objectName)

  // Read the previous logo BEFORE overwriting, so the old object can be swept.
  const { data: previous } = await admin
    .from('organisations')
    .select('logo_url')
    .eq('id', organisationId)
    .maybeSingle()

  const { error: updateError } = await admin
    .from('organisations')
    .update({ logo_url: publicUrl.publicUrl })
    .eq('id', organisationId)
  if (updateError) {
    console.error('[logo] organisation update failed:', updateError)
    // Do not leave an orphan object behind a failed write.
    await admin.storage.from(BUCKET).remove([objectName])
    return { ok: false, error: 'We could not save that logo. Please try again.' }
  }

  // Best-effort sweep of the replaced object. A failure here costs storage, not
  // correctness, and must never fail the organiser's upload.
  const previousPath = previous?.logo_url ? objectPathFromUrl(previous.logo_url) : null
  if (previousPath && previousPath.startsWith(`${user.id}/organisation/${organisationId}/`)) {
    const { error } = await admin.storage.from(BUCKET).remove([previousPath])
    if (error) console.warn('[logo] previous object sweep failed:', error)
  }

  return {
    ok: true,
    url: publicUrl.publicUrl,
    width: processed.width,
    height: processed.height,
    placement: processed.placement,
    hasAlpha: processed.hasAlpha,
  }
}

export async function removeOrganisationLogo(
  organisationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }
  if (!(await callerOwnsOrganisation(supabase, user.id, organisationId))) {
    return { ok: false, error: 'You do not have permission to change this logo.' }
  }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('organisations')
    .select('logo_url')
    .eq('id', organisationId)
    .maybeSingle()

  const { error } = await admin
    .from('organisations')
    .update({ logo_url: null })
    .eq('id', organisationId)
  if (error) return { ok: false, error: 'We could not remove that logo. Please try again.' }

  const path = current?.logo_url ? objectPathFromUrl(current.logo_url) : null
  if (path && path.startsWith(`${user.id}/organisation/${organisationId}/`)) {
    await admin.storage.from(BUCKET).remove([path])
  }
  return { ok: true }
}

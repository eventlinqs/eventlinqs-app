/**
 * AN EVENT'S PHOTO SET IS LOCKED TO IT AT UPLOAD (Lawal's 00:23 of 31 October 2026: "Photo sets are locked in per event
 * and unique to that event"; the photo system's P8 and P9). Every photo an organiser adds, the cover and each gallery
 * photo, is locked to that event the moment it is added; one already locked to another event, or a near copy of it, is
 * refused when it is added, in his words. The database decides (supabase/migrations/20261031010001_photo_assignments.sql:
 * photo_locked_elsewhere and photo_lock_for_event); a night of the same series adding its own photo again is not refused.
 */

export const PHOTO_ALREADY_USED = 'This photo is already used for another event. Please add a different one.'

export type PhotoLockRpc = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code: string; message: string } | null }>
}

export type PhotoHashes = { readonly sha256: string; readonly dhash: string }

/** Whether this photo is locked to an event other than eventId (any event when eventId is null). */
export async function photoLockedElsewhere(hashes: PhotoHashes, eventId: string | null, deps: PhotoLockRpc): Promise<boolean> {
  const answer = await deps.rpc('photo_locked_elsewhere', { p_sha256: hashes.sha256, p_dhash: hashes.dhash, p_event: eventId })
  if (answer.error) throw new Error(`whether the photo is used elsewhere could not be read: ${answer.error.message}`)
  return answer.data === true
}

/** Locks the photo to its event; refused in Lawal's words when another event holds it. Any other fault is thrown. */
export async function lockPhotoToEvent(
  input: { eventId: string; hashes: PhotoHashes; imageUrl: string; role: 'cover' | 'gallery' },
  deps: PhotoLockRpc,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const answer = await deps.rpc('photo_lock_for_event', {
    p_event: input.eventId,
    p_sha256: input.hashes.sha256,
    p_dhash: input.hashes.dhash,
    p_image_url: input.imageUrl,
    p_role: input.role,
  })
  if (!answer.error) return { ok: true }
  if (answer.error.code === '23514' && answer.error.message === PHOTO_ALREADY_USED) return { ok: false, error: PHOTO_ALREADY_USED }
  throw new Error(`the photo could not be locked to its event: ${answer.error.message}`)
}

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

/**
 * The upload's lock: a photo added before its event is saved (the create wizard uploads first) is not locked yet, for
 * the database knows no such event; the door has already refused one locked elsewhere, and lockSavedEventPhotos locks
 * it the moment the event is written. An event that exists is locked here, as before.
 */
export async function lockIfSaved(
  input: { eventId: string; saved: boolean; hashes: PhotoHashes; imageUrl: string; role: 'cover' | 'gallery' },
  deps: PhotoLockRpc,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.saved) return { ok: true }
  return lockPhotoToEvent({ eventId: input.eventId, hashes: input.hashes, imageUrl: input.imageUrl, role: input.role }, deps)
}

/**
 * Locks a newly saved event's photos (cover and gallery), each fingerprinted from its own stored bytes. Never throws:
 * the event is already saved, so a photo it could not lock is reported for the server log, not turned into a lost event.
 */
export async function lockSavedEventPhotos(
  input: { eventId: string; photos: readonly { url: string; role: 'cover' | 'gallery' }[] },
  deps: PhotoLockRpc & { hashesOf(url: string): Promise<PhotoHashes> },
): Promise<{ locked: number; notLocked: string[] }> {
  let locked = 0
  const notLocked: string[] = []
  for (const photo of input.photos) {
    try {
      const done = await lockPhotoToEvent({ eventId: input.eventId, hashes: await deps.hashesOf(photo.url), imageUrl: photo.url, role: photo.role }, deps)
      if (done.ok) locked += 1
      else notLocked.push(`${photo.url}: ${done.error}`)
    } catch (error) {
      notLocked.push(`${photo.url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { locked, notLocked }
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

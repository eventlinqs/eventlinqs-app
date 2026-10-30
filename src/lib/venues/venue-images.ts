import 'server-only'
import { randomUUID } from 'node:crypto'
import { photoHashes } from '@/lib/images/photo-hash'
import { PHOTO_ALREADY_USED, photoLockedElsewhere, type PhotoHashes } from '@/lib/images/photo-lock'
import { MAX_IMAGE_BYTES } from '@/lib/media/limits'
import { processEventImage } from '@/lib/media/image-pipeline'
import { createAdminClient } from '@/lib/supabase/admin'
import { venuePhotosFor, type VenuePhoto, type VenueUse } from './venue-photos-read'

/**
 * THE VENUE'S OWN PHOTOGRAPHS (the project manager's 16:42 of 30 October 2026, venue-first real photography). A
 * claimed venue's people add a photograph of their venue with their yes, replace one, withdraw one; they, or an
 * organiser with nights there, challenge one; staff approve one ONCE and it serves every night at that venue.
 *
 * The database decides every one of these (20261030171501_venue_images.sql): venue_image_add, venue_image_replace,
 * venue_image_challenge, venue_image_withdraw and venue_image_approve, each a definer function the service role alone
 * may call, each refusing in its own words. Visitors read only through venue_photos_for. This module is their one
 * caller.
 *
 * ORDER, as the organiser's media: a photograph is re-encoded by the image pipeline and stored first, then
 * registered; a refusal removes the stored file, so no file is left without its row.
 */

/** The bucket and folder the venue photographs live in (the PM's 16:52, E: event-images/venues/). */
export const VENUE_MEDIA_BUCKET = 'event-images'
export const VENUE_MEDIA_FOLDER = 'venues'

export type { VenuePhoto, VenueUse }
export { venuePhotosFor }
export type VenuePhotoAnswer = { readonly state: 'done'; readonly id: string } | { readonly state: 'refused'; readonly reason: string }

export type VenueMediaDeps = {
  process(bytes: ArrayBuffer): Promise<{ buffer: Buffer; extension: string; contentType: string }>
  /** The photo's fingerprint from the bytes the venue chose (src/lib/images/photo-hash.ts). */
  hash(bytes: ArrayBuffer): Promise<PhotoHashes>
  store(path: string, image: { buffer: Buffer; contentType: string }): Promise<string>
  remove(paths: string[]): Promise<void>
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code: string; message: string } | null }>
}

/** The database's refusal in its own words ("refused: ..." raised with 23514), first letter raised; any other fault is thrown. */
function refusalOf(error: { code: string; message: string }): VenuePhotoAnswer {
  const words = /^refused:\s*(.+)$/s.exec(error.message)?.[1]?.trim()
  if (error.code === '23514' && words) return { state: 'refused', reason: words.charAt(0).toUpperCase() + words.slice(1) }
  throw new Error(`the venue photograph change was not saved: ${error.message}`)
}

async function storeImage(
  venueId: string,
  file: File | null,
  deps: VenueMediaDeps,
): Promise<{ url: string; path: string; hashes: PhotoHashes } | { refused: string }> {
  if (!(file instanceof File) || file.size === 0) return { refused: 'Choose a photograph of your venue to add.' }
  if (file.size > MAX_IMAGE_BYTES) return { refused: 'The photograph must be under 10MB.' }
  let image
  let hashes: PhotoHashes
  try {
    const bytes = await file.arrayBuffer()
    image = await deps.process(bytes)
    hashes = await deps.hash(bytes)
  } catch {
    return { refused: 'That photograph could not be read. Try a JPEG or PNG.' }
  }
  // NO PHOTO IS EVER REUSED (Lawal's 00:23 of 31 October 2026, P9): a photo already locked to an event is refused here,
  // before it is stored. A library photo is locked itself only when it is dealt to a night (P11).
  if (await photoLockedElsewhere(hashes, null, deps)) return { refused: PHOTO_ALREADY_USED }
  const path = `${VENUE_MEDIA_FOLDER}/${venueId}/${randomUUID()}.${image.extension}`
  return { url: await deps.store(path, image), path, hashes }
}

/** The new photograph's fingerprint, written once, so it can be dealt to one night only. */
async function fingerprint(answer: VenuePhotoAnswer, hashes: PhotoHashes, deps: VenueMediaDeps): Promise<VenuePhotoAnswer> {
  if (answer.state !== 'done') return answer
  const marked = await deps.rpc('venue_image_fingerprint', { p_image: answer.id, p_sha256: hashes.sha256, p_dhash: hashes.dhash })
  if (marked.error) throw new Error(`the photograph was added but not fingerprinted: ${marked.error.message}`)
  return answer
}

async function register(path: string, name: string, args: Record<string, unknown>, deps: VenueMediaDeps): Promise<VenuePhotoAnswer> {
  let answer
  try {
    answer = await deps.rpc(name, args)
  } catch (fault) {
    await deps.remove([path])
    throw fault
  }
  if (answer.error) {
    await deps.remove([path])
    return refusalOf(answer.error)
  }
  return { state: 'done', id: String(answer.data) }
}

export async function addVenuePhoto(
  input: { userId: string; venueId: string; file: File | null; permissionWords: string; sourceUrl: string; credit: string | null },
  deps: VenueMediaDeps,
): Promise<VenuePhotoAnswer> {
  const stored = await storeImage(input.venueId, input.file, deps)
  if ('refused' in stored) return { state: 'refused', reason: stored.refused }
  const added = await register(stored.path, 'venue_image_add', {
    p_user: input.userId,
    p_venue: input.venueId,
    p_image_url: stored.url,
    p_source_url: input.sourceUrl,
    p_permission_words: input.permissionWords.trim(),
    p_attribution: input.credit?.trim() || null,
    p_uses: null,
  }, deps)
  return fingerprint(added, stored.hashes, deps)
}

export async function replaceVenuePhoto(
  input: { userId: string; venueId: string; imageId: string; file: File | null; permissionWords: string; sourceUrl: string },
  deps: VenueMediaDeps,
): Promise<VenuePhotoAnswer> {
  const stored = await storeImage(input.venueId, input.file, deps)
  if ('refused' in stored) return { state: 'refused', reason: stored.refused }
  const replaced = await register(stored.path, 'venue_image_replace', {
    p_user: input.userId,
    p_image: input.imageId,
    p_image_url: stored.url,
    p_source_url: input.sourceUrl,
    p_permission_words: input.permissionWords.trim(),
  }, deps)
  return fingerprint(replaced, stored.hashes, deps)
}

async function decide(name: string, args: Record<string, unknown>, id: string, deps: Pick<VenueMediaDeps, 'rpc'>): Promise<VenuePhotoAnswer> {
  const answer = await deps.rpc(name, args)
  if (answer.error) return refusalOf(answer.error)
  return { state: 'done', id }
}

export function challengeVenuePhoto(input: { userId: string; imageId: string; reason: string }, deps: Pick<VenueMediaDeps, 'rpc'>) {
  return decide('venue_image_challenge', { p_user: input.userId, p_image: input.imageId, p_reason: input.reason.trim() }, input.imageId, deps)
}

export function withdrawVenuePhoto(input: { userId: string; imageId: string }, deps: Pick<VenueMediaDeps, 'rpc'>) {
  return decide('venue_image_withdraw', { p_user: input.userId, p_image: input.imageId }, input.imageId, deps)
}

// A harvested original (a Commons file at full size) can be several times an upload's limit; it is only read to be
// fingerprinted, never stored. Our own working ceiling, not a published one.
const LARGEST_SOURCE_PHOTO_BYTES = 5 * MAX_IMAGE_BYTES

/** What an approval reads to fingerprint a photograph: its file, and whether the database already holds its fingerprint. */
export type FingerprintDeps = {
  photoOf(imageId: string): Promise<{ imageUrl: string; fingerprinted: boolean } | null>
  bytesOf(url: string): Promise<Buffer>
}

/**
 * Staff approve a photograph once: checked to show the venue, scored 0 to 100, primary on request. NO PHOTO IS EVER
 * REUSED (Lawal's ruling of 31 October 2026, 00:14): it is fingerprinted from its own bytes first (SHA-256 and difference
 * hash, written once by venue_image_fingerprint), so the database can give it to one night only, and then dealt
 * (deal_venue_photos). A photograph that cannot be read is not approved.
 */
export async function approveVenuePhoto(
  input: { adminId: string; imageId: string; quality: number; primary: boolean },
  deps: Pick<VenueMediaDeps, 'rpc'> & FingerprintDeps,
): Promise<VenuePhotoAnswer> {
  if (!Number.isInteger(input.quality) || input.quality < 0 || input.quality > 100) {
    return { state: 'refused', reason: 'Give the photograph a quality score from 0 to 100.' }
  }
  const photo = await deps.photoOf(input.imageId)
  if (!photo) return { state: 'refused', reason: 'No such photograph.' }
  if (!photo.fingerprinted) {
    let hashes: { sha256: string; dhash: string }
    try {
      hashes = await photoHashes(await deps.bytesOf(photo.imageUrl))
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      return { state: 'refused', reason: `The photograph could not be read to fingerprint it, so it was not approved: ${why}` }
    }
    const marked = await decide('venue_image_fingerprint', { p_image: input.imageId, p_sha256: hashes.sha256, p_dhash: hashes.dhash }, input.imageId, deps)
    if (marked.state === 'refused') return marked
  }
  const approved = await decide('venue_image_approve', { p_admin: input.adminId, p_image: input.imageId, p_quality: input.quality, p_primary: input.primary }, input.imageId, deps)
  if (approved.state === 'refused') return approved
  await dealVenuePhotos(deps)
  return approved
}

/**
 * Deals each venue's approved, fingerprinted photos one per open night, the strongest to the soonest (the photo system's
 * P3; public.deal_venue_photos). Answers how many it gave out; running it again gives out nothing new.
 */
export async function dealVenuePhotos(deps: Pick<VenueMediaDeps, 'rpc'>): Promise<number> {
  const dealt = await deps.rpc('deal_venue_photos', {})
  if (dealt.error) throw new Error(`the venue photos could not be dealt: ${dealt.error.message}`)
  return Number(dealt.data ?? 0)
}

/** Staff refuse a photograph, the reason kept; it never serves. */
export function refuseVenuePhoto(input: { adminId: string; imageId: string; reason: string }, deps: Pick<VenueMediaDeps, 'rpc'>) {
  return decide('venue_image_refuse', { p_admin: input.adminId, p_image: input.imageId, p_reason: input.reason.trim() }, input.imageId, deps)
}

/** Staff match a harvested candidate to one of our venues by hand; it still waits for approval. */
export function linkVenuePhoto(input: { adminId: string; imageId: string; venueId: string }, deps: Pick<VenueMediaDeps, 'rpc'>) {
  return decide('venue_image_link', { p_admin: input.adminId, p_image: input.imageId, p_venue: input.venueId }, input.imageId, deps)
}

/** The real dependencies: the image pipeline, the event-images bucket's venues folder, and the service role. */
export function venueMediaDeps(): VenueMediaDeps & FingerprintDeps {
  const admin = createAdminClient()
  return {
    async photoOf(imageId) {
      const { data, error } = await (admin.from('venue_images') as unknown as {
        select(c: string): { eq(k: string, v: string): { maybeSingle(): Promise<{ data: { image_url: string; photo_sha256: string | null } | null; error: { message: string } | null }> } }
      })
        .select('image_url, photo_sha256')
        .eq('id', imageId)
        .maybeSingle()
      if (error) throw new Error(`the photograph could not be read: ${error.message}`)
      return data ? { imageUrl: data.image_url, fingerprinted: data.photo_sha256 !== null } : null
    },
    async bytesOf(url) {
      // Wikimedia asks every client to name itself (https://meta.wikimedia.org/wiki/User-Agent_policy).
      const res = await fetch(url, { headers: { 'User-Agent': 'EventLinqs venue photos (https://www.eventlinqs.com.au; hello@eventlinqs.com)' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.byteLength > LARGEST_SOURCE_PHOTO_BYTES) throw new Error('the file is larger than any photograph we fingerprint')
      return bytes
    },
    hash: (bytes) => photoHashes(Buffer.from(bytes)),
    async process(bytes) {
      const result = await processEventImage(bytes, { role: 'cover' })
      if (!result.ok) throw new Error(result.error)
      return { buffer: result.image.buffer, extension: result.image.ext, contentType: result.image.contentType }
    },
    async store(path, image) {
      const { error } = await admin.storage.from(VENUE_MEDIA_BUCKET).upload(path, image.buffer, { upsert: false, contentType: image.contentType })
      if (error) throw new Error(`the photograph was not stored: ${error.message}`)
      return admin.storage.from(VENUE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
    },
    async remove(paths) {
      const { error } = await admin.storage.from(VENUE_MEDIA_BUCKET).remove(paths)
      if (error) throw new Error(`the photograph files were not removed: ${error.message}`)
    },
    async rpc(name, args) {
      // The deps name the function as a string (so a test can fake it); the typed client takes only a literal name.
      const { data, error } = await (admin.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>)(name, args)
      return { data, error: error ? { code: error.code, message: error.message } : null }
    },
  }
}

/** The one photograph of a venue that may be shown for a use, with its credit, or null: the chain's second link. */
export async function venuePhotoFor(venueId: string, use: VenueUse, deps: Pick<VenueMediaDeps, 'rpc'>): Promise<VenuePhoto | null> {
  return (await venuePhotosFor([venueId], use, deps)).get(venueId) ?? null
}

export type ShownVenuePhoto = { readonly id: string; readonly imageUrl: string; readonly credit: string }
type ShownVenuePhotoDeps = Pick<VenueMediaDeps, 'rpc'> & { idOf(venueId: string, imageUrl: string): Promise<string | null> }

/**
 * The photograph an organiser's nights at this venue show, with the id a challenge needs. Null when there is none. A
 * failed read is null too, so it takes only the challenge section away, never the organiser's event dashboard (this
 * also holds while the migration waits to be applied).
 */
export async function shownVenuePhoto(venueId: string, deps: ShownVenuePhotoDeps): Promise<ShownVenuePhoto | null> {
  try {
    const photo = (await venuePhotoFor(venueId, 'event_page', deps)) ?? (await venuePhotoFor(venueId, 'event_card', deps))
    if (!photo) return null
    const id = await deps.idOf(venueId, photo.imageUrl)
    return id ? { id, imageUrl: photo.imageUrl, credit: photo.credit } : null
  } catch {
    return null
  }
}

/** shownVenuePhoto's real reads, the id through the service role (a photograph is one row per venue and address). */
export function shownVenuePhotoDeps(): ShownVenuePhotoDeps {
  const admin = createAdminClient()
  return {
    rpc: venueMediaDeps().rpc,
    async idOf(venueId, imageUrl) {
      const { data, error } = await admin.from('venue_images').select('id').eq('venue_id', venueId).eq('image_url', imageUrl).maybeSingle()
      if (error) throw new Error(`the venue photograph could not be read: ${error.message}`)
      return (data as { id: string } | null)?.id ?? null
    },
  }
}

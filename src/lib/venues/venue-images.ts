import 'server-only'
import { randomUUID } from 'node:crypto'
import { MAX_IMAGE_BYTES } from '@/lib/media/limits'
import { processEventImage } from '@/lib/media/image-pipeline'
import { createAdminClient } from '@/lib/supabase/admin'

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

export type VenueUse = 'event_card' | 'event_page' | 'venue_page' | 'social'
export type VenuePhotoAnswer = { readonly state: 'done'; readonly id: string } | { readonly state: 'refused'; readonly reason: string }
export type VenuePhoto = {
  readonly imageUrl: string
  readonly credit: string
  readonly licence: string
  readonly licenceUrl: string | null
  readonly author: string | null
  /** The file page the event page's credit links to; null when the only source is a private email. */
  readonly fileUrl: string | null
}

export type VenueMediaDeps = {
  process(bytes: ArrayBuffer): Promise<{ buffer: Buffer; extension: string; contentType: string }>
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

async function storeImage(venueId: string, file: File | null, deps: VenueMediaDeps): Promise<{ url: string; path: string } | { refused: string }> {
  if (!(file instanceof File) || file.size === 0) return { refused: 'Choose a photograph of your venue to add.' }
  if (file.size > MAX_IMAGE_BYTES) return { refused: 'The photograph must be under 10MB.' }
  let image
  try {
    image = await deps.process(await file.arrayBuffer())
  } catch {
    return { refused: 'That photograph could not be read. Try a JPEG or PNG.' }
  }
  const path = `${VENUE_MEDIA_FOLDER}/${venueId}/${randomUUID()}.${image.extension}`
  return { url: await deps.store(path, image), path }
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
  return register(stored.path, 'venue_image_add', {
    p_user: input.userId,
    p_venue: input.venueId,
    p_image_url: stored.url,
    p_source_url: input.sourceUrl,
    p_permission_words: input.permissionWords.trim(),
    p_attribution: input.credit?.trim() || null,
    p_uses: null,
  }, deps)
}

export async function replaceVenuePhoto(
  input: { userId: string; venueId: string; imageId: string; file: File | null; permissionWords: string; sourceUrl: string },
  deps: VenueMediaDeps,
): Promise<VenuePhotoAnswer> {
  const stored = await storeImage(input.venueId, input.file, deps)
  if ('refused' in stored) return { state: 'refused', reason: stored.refused }
  return register(stored.path, 'venue_image_replace', {
    p_user: input.userId,
    p_image: input.imageId,
    p_image_url: stored.url,
    p_source_url: input.sourceUrl,
    p_permission_words: input.permissionWords.trim(),
  }, deps)
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

/** Staff approve a photograph once: checked to show the venue, scored 0 to 100, primary on request. */
export function approveVenuePhoto(input: { adminId: string; imageId: string; quality: number; primary: boolean }, deps: Pick<VenueMediaDeps, 'rpc'>) {
  if (!Number.isInteger(input.quality) || input.quality < 0 || input.quality > 100) {
    return Promise.resolve<VenuePhotoAnswer>({ state: 'refused', reason: 'Give the photograph a quality score from 0 to 100.' })
  }
  return decide('venue_image_approve', { p_admin: input.adminId, p_image: input.imageId, p_quality: input.quality, p_primary: input.primary }, input.imageId, deps)
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
export function venueMediaDeps(): VenueMediaDeps {
  const admin = createAdminClient()
  return {
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

/**
 * The page's read: one call for all its cards, each venue's one photograph by venue id. A venue with nothing approved
 * for the use is simply absent. A failed read is thrown, and the caller falls to its typographic cover.
 */
export async function venuePhotosFor(venueIds: readonly string[], use: VenueUse, deps: Pick<VenueMediaDeps, 'rpc'>): Promise<Map<string, VenuePhoto>> {
  const photos = new Map<string, VenuePhoto>()
  const venues = [...new Set(venueIds)]
  if (venues.length === 0) return photos
  const answer = await deps.rpc('venue_photos_for', { p_venues: venues, p_use: use })
  if (answer.error) throw new Error(`the venue photographs could not be read: ${answer.error.message}`)
  const rows = (Array.isArray(answer.data) ? answer.data : []) as ReadonlyArray<{
    venue_id: string
    image_url: string
    attribution_text: string
    licence: string
    licence_url: string | null
    author: string | null
    source_url: string | null
  }>
  for (const row of rows) {
    photos.set(row.venue_id, {
      imageUrl: row.image_url,
      credit: row.attribution_text,
      licence: row.licence,
      licenceUrl: row.licence_url,
      author: row.author,
      fileUrl: row.source_url,
    })
  }
  return photos
}

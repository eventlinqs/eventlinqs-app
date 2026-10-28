import 'server-only'
import { randomUUID } from 'node:crypto'
import { MAX_IMAGE_BYTES } from '@/lib/media/limits'
import { processEventImage } from '@/lib/media/image-pipeline'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * THE ORGANISER'S OWN IMAGES (the engine plan of 28 October 2026, part D: "organiser self-service add, replace,
 * withdraw"; the final directive's media-rights record). Once a listing is claimed with a yes, its organiser adds a
 * photo or artwork for one of their nights, replaces it, withdraws it, or withdraws the yes itself.
 *
 * The database decides every one of these (20261028203201_claim_acceptance.sql): organiser_media_add,
 * organiser_media_replace, organiser_media_withdraw and organiser_permission_withdraw, each a definer function the
 * service role alone may call, each checking that the user belongs to the night's organisation and that a yes covers
 * it. An added image goes into the asset register (social_assets) as organiser authorised and PENDING: a person
 * approves its use (J12) before any post carries it. This module is their one caller; it never writes social_assets
 * itself (social-one-writer).
 *
 * ORDER, so no stored file is ever left without its row and no row points at a file that was never stored: an image is
 * re-encoded by the image pipeline (magic bytes, orientation, metadata stripped) and stored first, then registered;
 * a refusal removes the stored file. A withdrawal is marked in the database first, then the file is removed, so the
 * image stops being usable at once even if the removal fails (the hourly sweep then pulls it from every unposted post).
 */

export const ORGANISER_MEDIA_BUCKET = 'organiser-media'

export type MediaKind = 'photo' | 'artwork'
export type MediaAnswer = { readonly state: 'done'; readonly id: string } | { readonly state: 'refused'; readonly reason: string }

export type MediaDeps = {
  /** The image pipeline; throws on anything it cannot read as an image. */
  process(bytes: ArrayBuffer): Promise<{ buffer: Buffer; extension: string; contentType: string }>
  /** Stores the re-encoded file at path in the organiser-media bucket and returns its public address. */
  store(path: string, image: { buffer: Buffer; contentType: string }): Promise<string>
  remove(paths: string[]): Promise<void>
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code: string; message: string } | null }>
}

/** The database's refusal in its own words ("refused: ..." raised with 23514), first letter raised; any other fault is thrown. */
function refusalOf(error: { code: string; message: string }): MediaAnswer {
  const words = /^refused:\s*(.+)$/s.exec(error.message)?.[1]?.trim()
  if (error.code === '23514' && words) return { state: 'refused', reason: words.charAt(0).toUpperCase() + words.slice(1) }
  throw new Error(`the organiser's media change was not saved: ${error.message}`)
}

function chosen(file: File | null): file is File {
  return file instanceof File && file.size > 0
}

/** Re-encodes and stores one image under its night's folder; the answer is its address and path, or a refusal. */
async function storeImage(folder: string, file: File | null, deps: MediaDeps): Promise<{ url: string; path: string } | { refused: string }> {
  if (!chosen(file)) return { refused: 'Choose a photo or artwork to add.' }
  if (file.size > MAX_IMAGE_BYTES) return { refused: 'The image must be under 10MB.' }
  let image
  try {
    image = await deps.process(await file.arrayBuffer())
  } catch {
    return { refused: 'That image could not be read. Try a JPEG or PNG.' }
  }
  const path = `${folder}/${randomUUID()}.${image.extension}`
  return { url: await deps.store(path, image), path }
}

async function register(path: string, call: () => ReturnType<MediaDeps['rpc']>, deps: MediaDeps): Promise<{ data: unknown } | MediaAnswer> {
  let answer
  try {
    answer = await call()
  } catch (fault) {
    await deps.remove([path])
    throw fault
  }
  if (answer.error) {
    await deps.remove([path])
    return refusalOf(answer.error)
  }
  return { data: answer.data }
}

export async function addOrganiserMedia(
  input: { userId: string; eventId: string; file: File | null; kind: MediaKind; attribution: string | null; restrictions: string | null },
  deps: MediaDeps,
): Promise<MediaAnswer> {
  const stored = await storeImage(input.eventId, input.file, deps)
  if ('refused' in stored) return { state: 'refused', reason: stored.refused }
  const done = await register(
    stored.path,
    () =>
      deps.rpc('organiser_media_add', {
        p_user: input.userId,
        p_event: input.eventId,
        p_asset_url: stored.url,
        p_original_name: (input.file as File).name,
        p_kind: input.kind,
        p_attribution: input.attribution?.trim() || null,
        p_restrictions: input.restrictions?.trim() || null,
      }),
    deps,
  )
  if ('state' in done) return done
  return { state: 'done', id: String(done.data) }
}

export async function replaceOrganiserMedia(input: { userId: string; assetId: string; file: File | null }, deps: MediaDeps): Promise<MediaAnswer> {
  const stored = await storeImage(`replaced/${input.assetId}`, input.file, deps)
  if ('refused' in stored) return { state: 'refused', reason: stored.refused }
  const done = await register(
    stored.path,
    () => deps.rpc('organiser_media_replace', { p_user: input.userId, p_asset: input.assetId, p_asset_url: stored.url, p_original_name: (input.file as File).name }),
    deps,
  )
  if ('state' in done) return done
  const row = done.data as { id: string; old_path: string | null }
  if (row.old_path) await deps.remove([row.old_path])
  return { state: 'done', id: row.id }
}

function reasonOf(reason: string): string | null {
  const r = reason.trim()
  return r.length >= 3 && r.length <= 500 ? r : null
}

const NO_REASON: MediaAnswer = { state: 'refused', reason: 'Say in a few words why, so we can tell the team.' }

export async function withdrawOrganiserMedia(input: { userId: string; assetId: string; reason: string }, deps: MediaDeps): Promise<MediaAnswer> {
  const reason = reasonOf(input.reason)
  if (!reason) return NO_REASON
  const answer = await deps.rpc('organiser_media_withdraw', { p_user: input.userId, p_asset: input.assetId, p_reason: reason })
  if (answer.error) return refusalOf(answer.error)
  const paths = (answer.data as string[] | null) ?? []
  if (paths.length > 0) await deps.remove(paths)
  return { state: 'done', id: input.assetId }
}

export async function withdrawOrganiserYes(input: { userId: string; permissionId: string; reason: string }, deps: MediaDeps): Promise<MediaAnswer> {
  const reason = reasonOf(input.reason)
  if (!reason) return NO_REASON
  const answer = await deps.rpc('organiser_permission_withdraw', { p_user: input.userId, p_permission: input.permissionId, p_reason: reason })
  if (answer.error) return refusalOf(answer.error)
  const paths = (answer.data as string[] | null) ?? []
  if (paths.length > 0) await deps.remove(paths)
  return { state: 'done', id: input.permissionId }
}

/** The deps as the platform holds them: the image pipeline, the organiser-media bucket, the database's functions. */
export function mediaDeps(): MediaDeps {
  const admin = createAdminClient()
  return {
    async process(bytes) {
      const result = await processEventImage(bytes, { role: 'cover' })
      if (!result.ok) throw new Error(result.error)
      return { buffer: result.image.buffer, extension: result.image.ext, contentType: result.image.contentType }
    },
    async store(path, image) {
      const { error } = await admin.storage.from(ORGANISER_MEDIA_BUCKET).upload(path, image.buffer, { upsert: false, contentType: image.contentType })
      if (error) throw new Error(`the image was not stored: ${error.message}`)
      return admin.storage.from(ORGANISER_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
    },
    async remove(paths) {
      const { error } = await admin.storage.from(ORGANISER_MEDIA_BUCKET).remove(paths)
      if (error) throw new Error(`the image files were not removed: ${error.message}`)
    },
    async rpc(name, args) {
      // The four functions are added by 20261028203201; until the generated types carry them, the call is by name.
      const { data, error } = await (admin.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { code: string; message: string } | null }>)(name, args)
      return { data, error: error ? { code: error.code, message: error.message } : null }
    },
  }
}

/**
 * "Your regular nights": the organiser keeps a series listing itself, or pauses it (the claim page's "Keep listing
 * these automatically", on by default). The database checks the series is theirs and never revives a removed one.
 */
export async function keepOrganiserSeries(input: { userId: string; seriesId: string; keep: boolean }, deps: Pick<MediaDeps, 'rpc'>): Promise<MediaAnswer> {
  const answer = await deps.rpc('organiser_series_keep', { p_user: input.userId, p_series: input.seriesId, p_keep: input.keep })
  if (answer.error) return refusalOf(answer.error)
  return { state: 'done', id: input.seriesId }
}

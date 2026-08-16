import { createAdminClient } from '@/lib/supabase/admin'
import { loadArtefactContext, toCardInput } from '@/lib/broadcast/kit-artefacts'
import { renderSocialCard } from '@/lib/broadcast/social-cards'
import { getSiteUrl } from '@/lib/site-url'
import { hasRealCover } from '@/lib/events/publish-gate'

/**
 * THE DESIGNED COVER, for an event whose organiser has no artwork.
 *
 * LAW 6 IS THE REASON THIS EXISTS AND THE REASON IT LOOKS LIKE THIS. The
 * platform never GENERATES imagery for an organiser's event: no text-to-image,
 * no generative fill, no stock photograph standing in for their night. What the
 * law prescribes for the no-artwork case is a TYPOGRAPHIC COMPOSITION built from
 * the organiser's own event details, in the brand system, and that composition
 * already exists and is already shipped. This module renders it at the event
 * cover frame; it does not draw anything.
 *
 * ONE RENDERER, NOT TWO. `TypographicCard` in
 * src/lib/broadcast/social-cards.tsx is the composition the Launch Kit gives an
 * organiser with no photograph, and it is format-generic: it fits the headline
 * to whatever box it is handed, so a short name grows until it spans the frame
 * and a long one steps down and takes more lines. Adding a fourth entry to
 * SOCIAL_CARD_FORMATS was the whole change on the rendering side. A second
 * renderer would have been a second thing to keep in step with the brand, and
 * they always drift.
 *
 * WHY IT MATTERS BEYOND LOOKS. `realCoverFirst` ranks an event with a real
 * organiser cover above one without (exclusion audit item 4, where a cover
 * FILTER was demoted to a cover SORT). An event with no cover therefore ranks
 * last on every surface, permanently, and cannot be published at all while the
 * publish gate and the validated `events_published_real_cover` constraint both
 * refuse it. A designed cover is the way out of that for an organiser who has a
 * night to sell and no poster to sell it with.
 */

/** The bucket event imagery already lives in. */
export const EVENT_IMAGE_BUCKET = 'event-images'

/** Where generated covers sit inside it, so they can be told apart later. */
export const GENERATED_COVER_PREFIX = 'generated-covers'

export type GeneratedCoverResult =
  | { ok: true; url: string; bytes: number; regenerated: boolean }
  | { ok: false; reason: 'event_not_found' | 'render_failed' | 'upload_failed' | 'update_failed'; detail?: string }

/**
 * Render the composition for one event and return the JPEG bytes.
 *
 * `origin` only decides the URL printed in the gold bar, so it is defaulted
 * rather than required; nothing here fetches it.
 */
export async function renderGeneratedCover(
  eventId: string,
  origin: string = getSiteUrl(),
): Promise<Uint8Array | null> {
  // mintLinks false: a cover is not a channel, so nothing is written to
  // share_links and no tracked code is burned to make an image.
  const context = await loadArtefactContext(eventId, origin, null, 'EventLinqs', false)
  if (!context) return null

  return renderSocialCard('cover', {
    ...toCardInput(context, 'qr'),
    // The two inputs that select the composition. `cover: null` IS the
    // typographic branch; a QR belongs on a poster somebody photographs, not on
    // the picture at the top of the page they are already reading.
    cover: null,
    qr: null,
    organiserLogo: null,
    summary: context.summary,
  })
}

/**
 * Render it, store it, and make it the event's cover.
 *
 * `force` re-mints over an existing generated cover; without it an event that
 * already has a real cover is left exactly as it is, because an organiser's own
 * artwork always outranks ours.
 */
export async function attachGeneratedCover(
  eventId: string,
  options: { force?: boolean; origin?: string } = {},
): Promise<GeneratedCoverResult> {
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, cover_image_url, created_by')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return { ok: false, reason: 'event_not_found' }

  const already = hasRealCover(event.cover_image_url)
  const isOurs = (event.cover_image_url ?? '').includes(`/${GENERATED_COVER_PREFIX}/`)
  if (already && !(options.force && isOurs)) {
    return { ok: true, url: event.cover_image_url as string, bytes: 0, regenerated: false }
  }

  let bytes: Uint8Array | null
  try {
    bytes = await renderGeneratedCover(eventId, options.origin)
  } catch (err) {
    return { ok: false, reason: 'render_failed', detail: err instanceof Error ? err.message : String(err) }
  }
  if (!bytes) return { ok: false, reason: 'event_not_found' }

  const objectName = `${GENERATED_COVER_PREFIX}/${eventId}/${Date.now()}.jpg`
  const { error: uploadError } = await admin.storage
    .from(EVENT_IMAGE_BUCKET)
    .upload(objectName, Buffer.from(bytes), {
      cacheControl: '31536000',
      upsert: false,
      contentType: 'image/jpeg',
    })
  if (uploadError) return { ok: false, reason: 'upload_failed', detail: uploadError.message }

  const { data: published } = admin.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(objectName)
  const url = published.publicUrl

  const { error: updateError } = await admin
    .from('events')
    .update({ cover_image_url: url, updated_at: new Date().toISOString() })
    .eq('id', eventId)
  if (updateError) return { ok: false, reason: 'update_failed', detail: updateError.message }

  return { ok: true, url, bytes: bytes.byteLength, regenerated: true }
}

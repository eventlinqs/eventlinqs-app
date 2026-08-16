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

/**
 * The details an organiser can change in the wizard without saving.
 *
 * WHY THESE FOUR AND NOT THE WHOLE ROW. A cover carrying stale details is worse
 * than no cover, and the details that move while somebody is authoring are the
 * name, when it is on and where it is. Everything else on the composition (the
 * price, the organiser name, the link) is an event-level fact that is already
 * saved by the time the media step is reached, so it is read from the row and
 * cannot be spoofed by the caller.
 */
export type CoverDetailOverrides = {
  title?: string | null
  /** Local wall clock, `YYYY-MM-DDTHH:mm`, exactly as the form holds it. */
  startLocal?: string | null
  venueName?: string | null
  venueCity?: string | null
  /**
   * The organisation's trading name, resolved SERVER-SIDE from a membership the
   * caller actually holds. Only used when there is no event row to read it from,
   * which is the create path.
   */
  organiserName?: string | null
}

/**
 * Format a LOCAL wall clock into the card's date language.
 *
 * No zone conversion happens here and that is deliberate: `2026-09-12T20:00` in
 * the event's own zone reads as "Saturday 12 September, 8:00 pm" to everybody
 * who will stand in that room. Converting it to an instant and back would
 * introduce a zone round trip with nothing to gain and a day boundary to lose.
 * The shapes match formatArtefactDateParts, and a test pins that they agree.
 */
export function labelsFromLocal(startLocal: string | null | undefined): {
  dateLabel: string
  timeLabel: string
} {
  if (!startLocal) return { dateLabel: '', timeLabel: '' }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(startLocal)
  if (!m) return { dateLabel: '', timeLabel: '' }
  const [, y, mo, d, h, mi] = m
  const asUtc = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)))
  const dateLabel = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(asUtc)
  const timeLabel = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
    .format(asUtc)
    .toLowerCase()
  return { dateLabel, timeLabel }
}

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
  overrides?: CoverDetailOverrides,
): Promise<Uint8Array | null> {
  // mintLinks false: a cover is not a channel, so nothing is written to
  // share_links and no tracked code is burned to make an image.
  const context = await loadArtefactContext(eventId, origin, null, 'EventLinqs', false)

  // NO ROW YET IS THE NORMAL CASE, not an error. The create wizard mints the
  // event id on the client and writes the row only at the end, so the organiser
  // who most needs a designed cover, the one starting from nothing, reaches the
  // media step before anything exists to read. Refusing here would have made the
  // escape hatch work everywhere except where it is needed.
  //
  // What is printed then: their own details, their organisation name resolved
  // from a membership they hold, and the platform address. No price, because
  // tickets come after this step and a made-up price on artwork is a lie; no
  // event URL, because the slug does not exist yet and a link that 404s is worse
  // than no link. ticketBarText prints the address alone when the price is empty.
  const base = context
    ? toCardInput(context, 'qr')
    : {
        title: '',
        dateLabel: '',
        timeLabel: '',
        placeLabel: '',
        priceLabel: '',
        shortUrl: origin,
        eyebrow: 'Live event',
        organiserName: overrides?.organiserName?.trim() || 'EventLinqs',
      }

  // The organiser's CURRENT details win over the saved row, so a cover made
  // during authoring never carries a name, date or venue they have already
  // changed. Anything they have not touched falls back to the row.
  const title = overrides?.title?.trim() || base.title
  const local = labelsFromLocal(overrides?.startLocal)
  const dateLabel = local.dateLabel || base.dateLabel
  const timeLabel = local.timeLabel || base.timeLabel
  const place = [overrides?.venueName?.trim(), overrides?.venueCity?.trim()]
    .filter(Boolean)
    .join(', ')
  const placeLabel = overrides ? place : base.placeLabel

  // A composition with no headline is not a cover. Without a row to fall back
  // on there is nothing else to draw, so this refuses rather than rendering a
  // navy rectangle and calling it artwork.
  if (!title.trim()) return null

  return renderSocialCard('cover', {
    ...base,
    title,
    dateLabel,
    timeLabel,
    placeLabel,
    // The two inputs that select the composition. `cover: null` IS the
    // typographic branch; a QR belongs on a poster somebody photographs, not on
    // the picture at the top of the page they are already reading.
    cover: null,
    qr: null,
    organiserLogo: null,
    summary: context?.summary ?? null,
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

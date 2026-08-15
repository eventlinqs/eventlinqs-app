import 'server-only'
import { ARTEFACT_CHANNELS, type ArtefactContext } from '@/lib/broadcast/kit-artefacts'
import type { CaptionPlatform } from '@/lib/broadcast/captions'
import type { KitDraftPayload } from './draft-store'

/**
 * A draft payload, rendered as the SAME ArtefactContext the published kit uses.
 *
 * This is the one adapter the whole build needed. Everything downstream -
 * `toCardInput`, `toCaptionInput`, `buildCaptions`, `renderSocialCard`, the
 * poster renderer - is a pure function over this shape and works untouched.
 * The published path builds the context from an event row; this builds the
 * identical structure from a draft that has no row yet.
 *
 * THE LINK RULE (founder ruling 9 August 2026, 0.2a). A stranger sees the full
 * kit and takes nothing until they claim it. So an unclaimed draft's artefacts
 * carry the KIT URL, which is real, resolves, and is theirs to bookmark. They
 * do NOT carry a tracked short code, because a tracked link with nothing to
 * track and no checkout behind it would be a promise we have not kept. Nothing
 * is ever rendered with a dead or fake URL: Law 5 holds on a preview exactly as
 * it does on a published page.
 *
 * THE EXTERNAL EXCEPTION (founder ruling 15 August 2026, non-negotiable 1). When
 * the organiser sells tickets on another platform, the artefacts carry a TRACKED
 * EVENTLINQS SHORT LINK on the canonical host, which 302s out to their box
 * office. The reasoning of 0.2a does not apply, because there IS something to
 * track: the click is the only signal that link will ever produce, and the
 * destination is a real checkout that exists today rather than one we are
 * promising to build.
 *
 * THE EXTERNAL URL IS NEVER PRINTED ON AN ARTEFACT. The poster, the QR, the
 * cards and the captions all show our address. That is not decoration: it keeps
 * the printed line short and canonical, it makes the click countable, and it
 * dissolves the ticketBarText hazard completely, because the host on the paper
 * genuinely IS ours and nothing has been swapped or implied.
 */

/** Australian date wording from the extractor's local "YYYY-MM-DDTHH:mm". */
function formatParts(local: string): {
  dateLabel: string
  shortDateLabel: string
  timeLabel: string
} {
  const m = local?.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return { dateLabel: '', shortDateLabel: '', timeLabel: '' }
  const [, y, mo, d, hh, mm] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm))
  if (Number.isNaN(date.getTime())) return { dateLabel: '', shortDateLabel: '', timeLabel: '' }

  const dateLabel = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  }).format(date)
  const shortDateLabel = new Intl.DateTimeFormat('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).format(date)
  const timeLabel = new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric', minute: '2-digit',
  }).format(date).toLowerCase()

  return { dateLabel, shortDateLabel, timeLabel }
}

function priceLabelFor(payload: KitDraftPayload): string {
  if (payload.isFree) return 'Free entry'
  if (payload.price == null || payload.price <= 0) return 'Free entry'
  const dollars = payload.price / 100 >= 1 && Number.isInteger(payload.price)
    ? payload.price
    : payload.price
  // Draft prices are captured in whole dollars by the extractor.
  return `From $${Math.round(dollars)}`
}

/**
 * The place line. When the address is held back (a private residence) this
 * shows the suburb only, so a home address never reaches a printed poster or a
 * social card.
 */
export function draftPlaceLabel(payload: KitDraftPayload): string {
  if (payload.addressHeldBack) {
    return payload.venueCity || payload.venueSuburb || ''
  }
  return [payload.venueName, payload.venueCity].filter(Boolean).join(', ')
}

export function buildDraftContext(opts: {
  payload: KitDraftPayload
  code: string
  origin: string
  organiserName: string
  /**
   * Tracked short CODES per channel, for an externally ticketed draft. Keyed by
   * channel with a `fallback` and a `qr` entry, exactly like `links`.
   *
   * Codes rather than URLs, so this module owns the address shape and there is
   * one place that decides an EventLinqs short link looks like `/e/<code>`.
   * Omitted or empty for an internal draft, which keeps the 0.2a kit-URL rule
   * byte-identical.
   */
  externalCodes?: Record<string, string> | null
}): ArtefactContext {
  const { payload, code, origin, organiserName, externalCodes } = opts
  const { dateLabel, shortDateLabel, timeLabel } = formatParts(payload.startDate)

  // The kit URL: real, resolving, shareable, and stable for 30 days.
  const kitUrl = `${origin}/launch/k/${code}`

  /*
   * An externally ticketed draft points every artefact at its tracked short
   * link. A channel with no minted code falls back to the kit URL rather than to
   * the external address, because the external address must never be printed and
   * a dead link must never be rendered: the kit page is real and resolves.
   */
  const shortUrl = (channel: string): string => {
    const shortCode = externalCodes?.[channel] ?? externalCodes?.fallback
    return shortCode ? `${origin}/e/${shortCode}` : kitUrl
  }

  const links = { fallback: shortUrl('fallback') } as ArtefactContext['links']
  for (const platform of ARTEFACT_CHANNELS) links[platform] = shortUrl(platform)
  links.qr = shortUrl('qr')

  const place = draftPlaceLabel(payload)
  const eyebrow = [payload.categoryName, payload.venueCity].filter(Boolean).join(' · ') || 'Live event'

  return {
    // A draft has no event id. Downstream renderers never read it; the field
    // exists so the shape matches exactly and one type serves both paths.
    eventId: '',
    slug: code,
    title: payload.title,
    dateLabel,
    shortDateLabel,
    timeLabel,
    venueName: payload.addressHeldBack ? null : (payload.venueName || null),
    city: payload.venueCity || null,
    placeLabel: place,
    priceLabel: priceLabelFor(payload),
    summary: payload.summary || null,
    categorySlug: null,
    categoryName: payload.categoryName || null,
    organiserName,
    organiserLogoUrl: null,
    coverImageUrl: payload.coverUrl,
    eyebrow,
    links,
  }
}

/** The channel set an unclaimed draft renders. Same six as the published kit. */
export const DRAFT_CHANNELS: readonly CaptionPlatform[] = ARTEFACT_CHANNELS

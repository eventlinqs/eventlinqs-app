import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { buildShortUrl, getOrCreateShareLink } from '@/lib/broadcast/share-links'
import { buildEventPosterPdf } from '@/lib/broadcast/poster'
import { priceLabel } from '@/lib/events/price-label'
import { fetchImageBytes } from '@/lib/media/fetch-image'
import { resolveLogoPlacement } from '@/lib/media/logo-pipeline'
import { captureException } from '@/lib/observability/sentry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The one-click QR poster download (SPEC section 2.4). Organiser-gated by
 * getOrganiserEvent (fails closed), so only the event's owner can mint its
 * poster. The QR carries the event's tracked 'qr' share link, so poster
 * scans show up beside every other channel in the reach panel.
 */

/**
 * Convert stored bytes to something pdf-lib can embed. JPEG and PNG go in
 * directly; webp and avif convert through the same sharp the upload pipeline
 * uses. A logo keeps its alpha by converting to PNG rather than JPEG, because
 * flattening a transparent mark onto white is exactly the defect this work
 * exists to remove.
 */
async function embeddable(
  bytes: Uint8Array | null,
  opts: { keepAlpha?: boolean } = {},
): Promise<{ bytes: Uint8Array; format: 'jpg' | 'png' } | null> {
  if (!bytes || bytes.length < 12) return null
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && !opts.keepAlpha) return { bytes, format: 'jpg' }
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, format: 'png' }
    const { default: sharp } = await import('sharp')
    if (opts.keepAlpha) {
      const png = await sharp(Buffer.from(bytes)).png().toBuffer()
      return { bytes: new Uint8Array(png), format: 'png' }
    }
    const jpeg = await sharp(Buffer.from(bytes)).jpeg({ quality: 85 }).toBuffer()
    return { bytes: new Uint8Array(jpeg), format: 'jpg' }
  } catch (error) {
    captureException(error, { where: 'app/api/organiser/events/[id]/poster/route:46' })
    // Unreadable: the poster draws its typographic composition instead.
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params
  const organiserEvent = await getOrganiserEvent(id)
  if (!organiserEvent) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  if (!(await isFeatureEnabled('broadcast_share'))) {
    return NextResponse.json({ ok: false, error: 'feature_off' }, { status: 404 })
  }

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('cover_image_url, venue_name, venue_city, ticket_tiers(price, currency), organisation:organisations(name, logo_url)')
    .eq('id', id)
    .maybeSingle()

  const link = await getOrCreateShareLink({
    eventId: organiserEvent.id,
    channel: 'qr',
    createdBy: organiserEvent.userId,
    eventSlug: organiserEvent.slug,
    eventStartDate: organiserEvent.startDate,
    eventTimezone: organiserEvent.timezone,
  })
  if (!link) {
    return NextResponse.json({ ok: false, error: 'link_mint_failed' }, { status: 500 })
  }

  const shortUrl = buildShortUrl(request.nextUrl.origin, link.code)
  const qrPng = await QRCode.toBuffer(shortUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 600,
  })

  const dateLabel = new Date(organiserEvent.startDate).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: organiserEvent.timezone ?? 'Australia/Sydney',
  })
  const locality = [event?.venue_name, event?.venue_city].filter(Boolean).join(', ')
  const tiers = (event?.ticket_tiers ?? []) as { price: number; currency: string | null }[]
  const price = priceLabel(tiers, 'Free entry')

  // Both reads are deadlined, so a slow object store degrades the poster to a
  // designed state rather than hanging the organiser's download.
  const organisation = (event as { organisation?: { name: string | null; logo_url: string | null } | null } | null)
    ?.organisation ?? null
  const [coverFetch, logoFetch] = await Promise.all([
    fetchImageBytes(event?.cover_image_url ?? null),
    fetchImageBytes(organisation?.logo_url ?? null),
  ])
  const organiserLogo = await embeddable(logoFetch?.bytes ?? null, { keepAlpha: true })
  let logoPlacement: 'on-navy' | 'on-tile' = 'on-tile'
  if (logoFetch) {
    try {
      logoPlacement = (await resolveLogoPlacement(Buffer.from(logoFetch.bytes))).placement
    } catch (error) {
      captureException(error, { where: 'app/api/organiser/events/[id]/poster/route:117' })
      // A mark we cannot measure gets the tile, which is always readable.
      logoPlacement = 'on-tile'
    }
  }

  const pdf = await buildEventPosterPdf({
    title: organiserEvent.title,
    dateLabel,
    locality,
    priceLabel: price ?? 'Free entry',
    shortUrl,
    qrPng: new Uint8Array(qrPng),
    coverImage: await embeddable(coverFetch?.bytes ?? null),
    organiserName: organisation?.name ?? organiserEvent.organisationName,
    organiserLogo,
    logoPlacement,
  })

  // Record the download as a real Launch Kit usage signal for the founder's
  // demand-signal view. Best-effort: never block or fail the download.
  try {
    await admin.from('kit_poster_downloads').insert({
      event_id: id,
      organisation_id: organiserEvent.organisationId,
    })
  } catch (error) {
    captureException(error, { where: 'app/api/organiser/events/[id]/poster/route:144' })
    // signal only; a lost row never affects the poster
  }

  const filename = `${organiserEvent.slug || 'event'}-poster.pdf`
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  })
}

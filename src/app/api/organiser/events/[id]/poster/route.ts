import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { buildShortUrl, getOrCreateShareLink } from '@/lib/broadcast/share-links'
import { buildEventPosterPdf } from '@/lib/broadcast/poster'
import { priceLabel } from '@/lib/events/price-label'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The one-click QR poster download (SPEC section 2.4). Organiser-gated by
 * getOrganiserEvent (fails closed), so only the event's owner can mint its
 * poster. The QR carries the event's tracked 'qr' share link, so poster
 * scans show up beside every other channel in the reach panel.
 */

/** Convert a fetched cover to pdf-lib-embeddable bytes. webp/avif covers are
 * converted to JPEG through the same sharp used by the upload pipeline. */
async function embeddableCover(
  url: string | null,
): Promise<{ bytes: Uint8Array; format: 'jpg' | 'png' } | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length < 12) return null

    // Magic-byte sniff: JPEG and PNG embed directly.
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, format: 'jpg' }
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, format: 'png' }

    // Everything else (webp, avif) converts to JPEG via sharp.
    const { default: sharp } = await import('sharp')
    const jpeg = await sharp(Buffer.from(bytes)).jpeg({ quality: 85 }).toBuffer()
    return { bytes: new Uint8Array(jpeg), format: 'jpg' }
  } catch {
    // No embeddable image: the poster renders its branded fallback.
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
    .select('cover_image_url, venue_name, venue_city, ticket_tiers(price, currency)')
    .eq('id', id)
    .maybeSingle()

  const link = await getOrCreateShareLink({
    eventId: organiserEvent.id,
    channel: 'qr',
    createdBy: organiserEvent.userId,
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

  const pdf = await buildEventPosterPdf({
    title: organiserEvent.title,
    dateLabel,
    locality,
    priceLabel: price ?? 'Free entry',
    shortUrl,
    qrPng: new Uint8Array(qrPng),
    coverImage: await embeddableCover(event?.cover_image_url ?? null),
  })

  const filename = `${organiserEvent.slug || 'event'}-poster.pdf`
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
    },
  })
}

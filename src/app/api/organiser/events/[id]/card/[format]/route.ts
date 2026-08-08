import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { getOrganiserEvent } from '@/lib/reporting/attendees'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { loadArtefactContext, toCardInput } from '@/lib/broadcast/kit-artefacts'
import {
  prepareCardCover,
  prepareLogo,
  renderSocialCard,
  type PreparedCover,
} from '@/lib/broadcast/social-cards'
import {
  SOCIAL_CARD_EXTENSION,
  SOCIAL_CARD_MIME,
  isSocialCardFormat,
} from '@/lib/broadcast/social-card-spec'
import { cardFilename } from '@/lib/broadcast/social-card-layout'
import type { CaptionPlatform } from '@/lib/broadcast/captions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The social card download. One request, one posted-ready file.
 *
 * Organiser-gated by getOrganiserEvent, which fails closed, exactly like the
 * poster route: only the event's owner can mint its artefacts.
 *
 * The channel matters. Each card carries the tracked short link for the channel
 * it is going to, so a ticket sold from the story the organiser posted to
 * Instagram is attributed to Instagram rather than to a general pool. That
 * attribution is the whole point of the artefact, so it is a query parameter
 * with a sane default rather than something the caller may omit into a shared
 * bucket.
 */

const CHANNELS: readonly string[] = ['instagram', 'facebook', 'whatsapp', 'x', 'linkedin', 'email']

/** Fetch the organiser's own image and hand back raw bytes, or nothing. */
async function fetchBytes(url: string | null): Promise<Uint8Array | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    return bytes.byteLength > 12 ? bytes : null
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> },
): Promise<NextResponse> {
  const { id, format } = await params
  if (!isSocialCardFormat(format)) {
    return NextResponse.json({ ok: false, error: 'unknown_format' }, { status: 404 })
  }

  const organiserEvent = await getOrganiserEvent(id)
  if (!organiserEvent) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  const requested = request.nextUrl.searchParams.get('channel') ?? ''
  const channel = (CHANNELS.includes(requested) ? requested : 'instagram') as CaptionPlatform

  // The share tooling being off never breaks the artefact: the card falls back
  // to the plain event URL, which still resolves and still sells a ticket. It
  // simply is not attributed.
  const shareOn = await isFeatureEnabled('broadcast_share')
  const context = await loadArtefactContext(
    id,
    request.nextUrl.origin,
    organiserEvent.userId,
    organiserEvent.organisationName,
    shareOn,
  )
  if (!context) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  const cardInput = toCardInput(context, channel)
  const shortUrl = cardInput.shortUrl

  const [coverBytes, logoBytes] = await Promise.all([
    fetchBytes(context.coverImageUrl),
    fetchBytes(context.organiserLogoUrl),
  ])

  let cover: PreparedCover | null = null
  if (coverBytes) cover = await prepareCardCover(coverBytes, format)
  const organiserLogo = logoBytes ? await prepareLogo(logoBytes) : null

  const qr = await QRCode.toDataURL(shortUrl, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 480,
    color: { dark: '#0A1628', light: '#FFFFFF' },
  })

  const bytes = await renderSocialCard(format, {
    ...cardInput,
    shortUrl,
    organiserLogo,
    cover,
    qr,
  })

  const filename = cardFilename(context.slug, format, SOCIAL_CARD_EXTENSION)
  return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': SOCIAL_CARD_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.byteLength),
      // Private: the artefact carries the organiser's own tracked link.
      'Cache-Control': 'private, no-store',
    },
  })
}

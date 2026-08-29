import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { captureException } from '@/lib/observability/sentry'
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
import { fetchImageBytes } from '@/lib/media/fetch-image'

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

  // Both reads are deadlined. A slow object store degrades the artefact to its
  // designed fallback rather than hanging the organiser's download.
  const [cover, logo] = await Promise.all([
    fetchImageBytes(context.coverImageUrl),
    fetchImageBytes(context.organiserLogoUrl),
  ])

  let preparedCover: PreparedCover | null = null
  if (cover) preparedCover = await prepareCardCover(cover.bytes, format)
  const organiserLogo = logo ? await prepareLogo(logo.bytes) : null

  const qr = await QRCode.toDataURL(shortUrl, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 480,
    color: { dark: '#0A1628', light: '#FFFFFF' },
  })

  /*
   * THE RENDER MUST NOT FAIL SILENTLY, and until 29 August 2026 it did.
   *
   * An unhandled throw here produced HTTP 500 with a ZERO-BYTE body and a log
   * line reading only "Error: Input buffer contains unsupported image format",
   * which is sharp complaining about what ImageResponse handed it. That message
   * names the second-to-last step and says nothing about the render that
   * actually failed, and Next ignore-lists the frames, so the organiser got a
   * broken download and the operator got a sentence pointing at the wrong
   * place. All eighteen downloads (three sizes across six channels) failed that
   * way on two independent checkouts.
   *
   * So the error is CAPTURED with its real message and the artefact the caller
   * asked for is named alongside it. A zero-byte 500 is the least debuggable
   * thing this route can produce.
   */
  let bytes: Uint8Array
  try {
    bytes = await renderSocialCard(format, {
      ...cardInput,
      shortUrl,
      organiserLogo,
      cover: preparedCover,
      qr,
    })
  } catch (error) {
    captureException(error, { where: 'app/api/organiser/events/[id]/card/[format]/route:render' })
    console.error('[card] render failed', {
      eventId: id,
      format,
      channel,
      hadCover: Boolean(preparedCover),
      hadLogo: Boolean(organiserLogo),
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      { ok: false, error: 'render_failed', format, channel },
      { status: 500 },
    )
  }

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

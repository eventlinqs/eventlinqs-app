import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { readDraftByCode } from '@/lib/launch/draft-store'
import { buildDraftContext } from '@/lib/launch/draft-artefacts'
import { readExternalCodesForDraft } from '@/lib/broadcast/share-links'
import { toCardInput } from '@/lib/broadcast/kit-artefacts'
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
import { applyRateLimit } from '@/lib/rate-limit/middleware'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A share card for an UNCLAIMED, anonymous draft.
 *
 * THE GATE (founder ruling 0.2a, 9 August 2026): "They see everything, take
 * nothing until they claim it." So this route has two modes and the difference
 * between them is one header plus one auth check:
 *
 *   VIEW      (default)      anyone, no account. Content-Disposition: inline.
 *   DOWNLOAD  (?download=1)  requires a signed-in account. attachment.
 *
 * Being straight about what that does and does not do: an inline image can be
 * saved by anybody who knows how to save an image, and this is not DRM and is
 * not pretending to be. The ruling is about the product's posture, which is
 * that the kit is shown in full and the download CONTROL is what an account
 * buys. Dressing that up as enforcement would be a lie told to ourselves.
 *
 * It is a sibling of the organiser card route and reuses that route's entire
 * back half verbatim: prepareCardCover, prepareLogo, QRCode, renderSocialCard.
 * Only the first two steps differ, exactly as Phase 0 predicted: a code lookup
 * instead of an organiser gate, and buildDraftContext instead of
 * loadArtefactContext.
 */

const CHANNELS: readonly string[] = ['instagram', 'facebook', 'whatsapp', 'x', 'linkedin', 'email']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string; format: string }> },
): Promise<NextResponse> {
  const { code, format } = await params

  if (!isSocialCardFormat(format)) {
    return NextResponse.json({ ok: false, error: 'unknown_format' }, { status: 404 })
  }

  // Bounds render CPU only: composition is local and spends no model tokens,
  // so this fails open by policy. A Redis blip must not blank a stranger's kit.
  const limited = await applyRateLimit('launch-artefact', request)
  if (limited) return limited

  const draft = await readDraftByCode(code)
  if (!draft) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  }

  const wantsDownload = request.nextUrl.searchParams.get('download') === '1'
  if (wantsDownload) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 })
    }
  }

  const requested = request.nextUrl.searchParams.get('channel') ?? ''
  const channel = (CHANNELS.includes(requested) ? requested : 'instagram') as CaptionPlatform

  // See the poster route: read the tracked codes, never mint them here.
  const externalCodes = draft.payload.externalTicketUrl
    ? await readExternalCodesForDraft(draft.code)
    : null

  const context = buildDraftContext({
    payload: draft.payload,
    code: draft.code,
    origin: request.nextUrl.origin,
    // An anonymous draft has no organisation yet. The organiser's own words
    // are the only name we have, and inventing one would be a placeholder.
    organiserName: '',
    externalCodes,
  })

  const cardInput = toCardInput(context, channel)

  const cover = await fetchImageBytes(context.coverImageUrl)
  let preparedCover: PreparedCover | null = null
  if (cover) preparedCover = await prepareCardCover(cover.bytes, format)

  const logo = await fetchImageBytes(context.organiserLogoUrl)
  const organiserLogo = logo ? await prepareLogo(logo.bytes) : null

  const qr = await QRCode.toDataURL(cardInput.shortUrl, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 480,
    color: { dark: '#0A1628', light: '#FFFFFF' },
  })

  const bytes = await renderSocialCard(format, {
    ...cardInput,
    shortUrl: cardInput.shortUrl,
    organiserLogo,
    cover: preparedCover,
    qr,
  })

  const filename = cardFilename(context.slug, format, SOCIAL_CARD_EXTENSION)

  return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': SOCIAL_CARD_MIME,
      'Content-Disposition': wantsDownload
        ? `attachment; filename="${filename}"`
        : 'inline',
      'Content-Length': String(bytes.byteLength),
      // A draft is somebody's unpublished event, often at a private address,
      // so this is never held by a SHARED cache and never indexed. The
      // visitor's OWN browser may hold it briefly, which matters: without it
      // every scroll past the reveal re-rendered four artefacts and burned
      // four rate-limit tokens, which is how the live walk tripped its own
      // limit. Ten minutes is long enough to make re-viewing free and short
      // enough that an edited draft corrects itself without a cache key.
      'Cache-Control': 'private, max-age=600',
      'X-Robots-Tag': 'noindex, nofollow, noimageindex',
    },
  })
}

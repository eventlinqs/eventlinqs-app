import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { getAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { captureException } from '@/lib/observability/sentry'
import { createAdminClient } from '@/lib/supabase/admin'
import { toCardInput } from '@/lib/broadcast/kit-artefacts'
import { prepareCardCover, prepareLogo, renderSocialCard } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_EXTENSION, SOCIAL_CARD_MIME } from '@/lib/broadcast/social-card-spec'
import { cardFilename } from '@/lib/broadcast/social-card-layout'
import { fetchImageBytes } from '@/lib/media/fetch-image'
import { cardOf } from '@/lib/social/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ONE PLANNED POST'S CARD (item 11, the social engine; docs/SOCIAL-ENGINE.md): the Launch Kit's own renderer, the
 * event's own photo, and the post's OWN tracked link and QR, so a ticket sold from this post is this post's. JPEG, as
 * Instagram takes only JPEG ("JPEG is the only image format supported", Meta's content publishing page). Staff only:
 * the organiser's own kit has its own route.
 */
export async function GET(request: Request, { params }: { params: Promise<{ postId: string }> }): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (!can(session, 'admin.network.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { postId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const card = await cardOf(createAdminClient(), postId, new Date())
  if (card === null) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const input = toCardInput(card.context, card.platform)
  const [cover, logo] = await Promise.all([fetchImageBytes(card.context.coverImageUrl), fetchImageBytes(card.context.organiserLogoUrl)])
  try {
    const bytes = await renderSocialCard(card.format, {
      ...input,
      shortUrl: card.link,
      listing: card.listing,
      libraryPhoto: card.libraryPhoto,
      cover: cover ? await prepareCardCover(cover.bytes, card.format) : null,
      organiserLogo: logo ? await prepareLogo(logo.bytes) : null,
      qr: await QRCode.toDataURL(card.link, { errorCorrectionLevel: 'M', margin: 0, width: 480, color: { dark: '#0A1628', light: '#FFFFFF' } }),
    })
    const download = new URL(request.url).searchParams.get('download') === '1'
    return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': SOCIAL_CARD_MIME,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${cardFilename(card.context.slug, card.format, SOCIAL_CARD_EXTENSION)}"`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    captureException(error, { where: 'app/admin/(authed)/social/card/[postId]/route:render' })
    return NextResponse.json({ error: 'render_failed', format: card.format }, { status: 500 })
  }
}

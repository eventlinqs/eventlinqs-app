import { NextResponse, type NextRequest } from 'next/server'
import { captureException } from '@/lib/observability/sentry'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatsOf, renderCampaignSlide, type Format } from '@/lib/broadcast/campaign-slides'
import { readPublicKit, slideImagesNow } from '@/lib/social/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ONE SLIDE OF AN APPROVED PARTNER KIT, AT A PUBLIC ADDRESS (window 6's 29 October 2026, 16:58): message 7 ("you're
 * featured") gives the partner their kit's images, which rendered only behind /admin, so it was held every time. The
 * same slide the founder approved in /admin/social, drawn by the same renderer.
 *
 * PUBLIC BY DESIGN, and only this: a partner kit whose newest version is approved and not rejected
 * (store.publicKitServes); every other piece, a draft, a rejected or replaced kit, an unknown id or a slide past the
 * kit's last answers 404, so an address reveals nothing it does not serve. The id is the piece's uuid, sent only to that
 * partner. The image is asked of the register AT THIS MOMENT, as the admin route asks it: one withdrawn, replaced or
 * expired is not drawn and the night is told in type (the engine plan's part D), and the public cache is an hour at
 * most, so a withdrawal leaves every copy within the hour. ?format=square on a feed kit, as the admin route allows.
 * Its cost is CPU on the slide raster path, bounded by the launch-artefact limit every anonymous render takes. Never
 * indexed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ pieceId: string; n: string }> }): Promise<NextResponse> {
  const { pieceId, n } = await params
  const index = Number(n)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pieceId) || !Number.isInteger(index) || index < 1 || index > 20) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const limited = await applyRateLimit('launch-artefact', request)
  if (limited) return limited

  const db = createAdminClient()
  const kit = await readPublicKit(db, pieceId)
  if (kit === null || index > kit.slides.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const asked = new URL(request.url).searchParams.get('format')
  const allowed = formatsOf(kit.format)
  const format = (asked ?? allowed[0]) as Format
  if (!allowed.includes(format)) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  try {
    const image = (await slideImagesNow(db, kit.slides, new Date())).get(index - 1) ?? null
    const bytes = await renderCampaignSlide(format, kit.slides[index - 1], index, kit.slides.length, null, image)
    const shape = format === 'feed' ? 'portrait' : format
    const name = `eventlinqs-kit-${kit.city}-${String(index).padStart(2, '0')}-${shape}.jpg`
    return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `inline; filename="${name}"`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
        'X-Robots-Tag': 'noindex, nofollow, noimageindex',
      },
    })
  } catch (error) {
    captureException(error, { where: 'app/kit/[pieceId]/[n]/route:render' })
    return NextResponse.json({ error: 'render_failed' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { captureException } from '@/lib/observability/sentry'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderCampaignSlide } from '@/lib/broadcast/campaign-slides'
import { readPiece } from '@/lib/social/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ONE SLIDE OF A WEEKLY CAMPAIGN PIECE (the release checklist of 28 October 2026, B4 and C3 to C8): the JPEG Instagram
 * and Facebook take, drawn from the piece's own slide data at the format's published size, to download on the
 * founder's phone. Staff only, checked here on the server as well as by the page (F1): a person with no admin session
 * gets 401 and never a slide.
 */
export async function GET(request: Request, { params }: { params: Promise<{ pieceId: string; n: string }> }): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (!can(session, 'admin.network.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { pieceId, n } = await params
  const index = Number(n)
  if (!/^[0-9a-f-]{36}$/i.test(pieceId) || !Number.isInteger(index) || index < 1) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const piece = await readPiece(createAdminClient(), pieceId)
  if (piece === null || index > piece.slides.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  try {
    const bytes = await renderCampaignSlide(piece.format, piece.slides[index - 1], index, piece.slides.length, null)
    const download = new URL(request.url).searchParams.get('download') === '1'
    const name = `eventlinqs-${piece.kind.replace(/_/g, '-')}-${piece.city}-${String(index).padStart(2, '0')}.jpg`
    return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    captureException(error, { where: 'app/admin/(authed)/social/piece/[pieceId]/[n]/route:render' })
    return NextResponse.json({ error: 'render_failed' }, { status: 500 })
  }
}

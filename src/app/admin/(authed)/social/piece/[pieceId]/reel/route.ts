import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { captureException } from '@/lib/observability/sentry'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderCampaignSlide } from '@/lib/broadcast/campaign-slides'
import { readPiece, slideImagesNow } from '@/lib/social/store'
import { REEL, encodeReel } from '@/lib/social/reel-video'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Measured on car 12's deployed preview (30 October 2026): a seven-slide Reel took 40 to 43 s on Vercel, its slides
// drawn and then encoded, so 60 s left too thin a margin. 300 s is Vercel's own default ceiling for a function
// (https://vercel.com/docs/functions/limitations, read 30 October 2026).
export const maxDuration = 300

/**
 * WEDNESDAY's DISCOVERY REEL AS ONE MP4, MADE ON THE SERVER (the register's row C5: "An MP4 exported from production
 * /admin/social"). Staff only, checked here as well as by the page, exactly as each slide's own download
 * (../[n]/route.ts): no admin session is 401 and never a video.
 *
 * Every frame is the piece's own slide at the story format, drawn by the same renderer and with each image asked of
 * the register AT THIS MOMENT, so a photograph withdrawn since planning is drawn in type here too; the frames are then
 * joined by src/lib/social/reel-video.ts. Only a Discovery Reel is made into a video.
 */
export async function GET(request: Request, { params }: { params: Promise<{ pieceId: string }> }): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (!can(session, 'admin.network.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { pieceId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(pieceId)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const db = createAdminClient()
  const piece = await readPiece(db, pieceId)
  if (piece === null || piece.kind !== 'discovery_reel') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (piece.slides.length === 0 || piece.slides.length > REEL.maxFrames) return NextResponse.json({ error: 'not_a_reel' }, { status: 422 })

  try {
    const images = await slideImagesNow(db, piece.slides, new Date())
    const frames: Uint8Array[] = []
    for (const [i, slide] of piece.slides.entries()) {
      frames.push(await renderCampaignSlide('story', slide, i + 1, piece.slides.length, null, images.get(i) ?? null))
    }
    const bytes = await encodeReel(frames)
    const name = `eventlinqs-discovery-reel-${piece.city}.mp4`
    const download = new URL(request.url).searchParams.get('download') === '1'
    return new NextResponse(Buffer.from(bytes) as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    captureException(error, { where: 'app/admin/(authed)/social/piece/[pieceId]/reel/route:encode' })
    return NextResponse.json({ error: 'encode_failed' }, { status: 500 })
  }
}

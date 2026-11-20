import { NextResponse, type NextRequest } from 'next/server'
import { fetchImageBytes } from '@/lib/media/fetch-image'
import { composeNewsletterImage, isNewsletterImageSource, isNlImageKind } from '@/lib/newsletter/compose-image'
import { CANONICAL_HOST } from '@/lib/site-url'

/**
 * GET /api/newsletter/image?k=<kind>&src=<photograph>: one of the newsletter's composed images (law 46, design A), drawn
 * on request and cached for good, since a source address names one photograph. Only our own or a licensed library's
 * photograph is drawn (compose-image.ts isNewsletterImageSource); anything else is refused with 400. A photograph that
 * cannot be read draws the navy canvas, so an email never shows a broken picture.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const kind = request.nextUrl.searchParams.get('k')
  const src = request.nextUrl.searchParams.get('src')
  if (!isNlImageKind(kind)) return NextResponse.json({ error: 'unknown image kind' }, { status: 400 })
  if (src !== null && !isNewsletterImageSource(src, { storageOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null, siteHosts: [CANONICAL_HOST, 'eventlinqs.com.au'] })) {
    return NextResponse.json({ error: 'the newsletter draws only from our own or a licensed photograph' }, { status: 400 })
  }
  const fetched = src ? await fetchImageBytes(src, 8000) : null
  let body: Buffer
  try {
    body = await composeNewsletterImage(kind, fetched?.bytes ?? null)
  } catch (error) {
    console.error('[newsletter/image] the photograph could not be drawn, the navy canvas is sent:', error instanceof Error ? error.message : error)
    body = await composeNewsletterImage(kind, null)
  }
  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      // A drawing of a fallback is cached briefly, so a photograph that comes back is drawn again.
      'Cache-Control': fetched ? 'public, max-age=86400, s-maxage=31536000, immutable' : 'public, max-age=300, s-maxage=300',
    },
  })
}

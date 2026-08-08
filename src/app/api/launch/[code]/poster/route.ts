import { NextResponse, type NextRequest } from 'next/server'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { readDraftByCode } from '@/lib/launch/draft-store'
import { buildDraftContext } from '@/lib/launch/draft-artefacts'
import { buildEventPosterPdf, type PosterImage } from '@/lib/broadcast/poster'
import { fetchImageBytes } from '@/lib/media/fetch-image'
import { applyRateLimit } from '@/lib/rate-limit/middleware'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The print-ready A4 poster for an UNCLAIMED, anonymous draft.
 *
 * Same gate as the anonymous card route: VIEW is free and inline, DOWNLOAD
 * (?download=1) needs an account. The QR carries the kit URL, which is real,
 * resolves today, and keeps resolving for thirty days, so Law 5 holds on a
 * printed preview exactly as on a published poster. Nothing here ever prints a
 * dead link.
 *
 * The private-residence rule travels with the context: buildDraftContext
 * returns a suburb-only place label when the address is held back, so a home
 * address cannot reach a printed page.
 */

/** Same conversion the organiser poster route uses. */
async function embeddable(
  bytes: Uint8Array | null,
  opts: { keepAlpha?: boolean } = {},
): Promise<PosterImage | null> {
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
  } catch {
    // Unreadable: the poster draws its typographic composition instead, which
    // is Law 6's answer to "no artwork" and needs no apology.
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params

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

  const context = buildDraftContext({
    payload: draft.payload,
    code: draft.code,
    origin: request.nextUrl.origin,
    organiserName: '',
  })

  const shortUrl = context.links.qr ?? context.links.fallback
  const qrPng = await QRCode.toBuffer(shortUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 600,
  })

  const coverFetch = await fetchImageBytes(context.coverImageUrl)

  const pdf = await buildEventPosterPdf({
    title: context.title,
    dateLabel: context.dateLabel,
    locality: context.placeLabel,
    priceLabel: context.priceLabel,
    shortUrl,
    qrPng: new Uint8Array(qrPng),
    coverImage: await embeddable(coverFetch?.bytes ?? null),
    organiserName: context.organiserName,
    organiserLogo: null,
    logoPlacement: 'on-tile',
  })

  const filename = `${draft.code}-poster-a4.pdf`

  return new NextResponse(Buffer.from(pdf) as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': wantsDownload
        ? `attachment; filename="${filename}"`
        : 'inline',
      'Content-Length': String(pdf.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noimageindex',
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'

// QR is generated on demand (no Storage bucket). Node runtime: the
// `qrcode` package needs Node APIs. force-dynamic + private cache so a
// QR is never edge-cached across holders.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/tickets/[code]/qr?k=<secret>
 *
 * Returns a PNG QR encoding the bearer URL (code + secret). Used by the
 * confirmation email (email clients cannot run the SVG page render).
 * The web ticket page renders its QR as inline SVG instead.
 *
 * Auth model: bearer. The (ticket_code, secret) pair IS the credential
 * (paper-ticket model), validated server-side via the service-role
 * admin client. ticket_code alone is insufficient - secret must match.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  const secret = request.nextUrl.searchParams.get('k')
  if (!code || !secret) {
    return new NextResponse('Not found', { status: 404 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('tickets')
    .select('ticket_code, secret')
    .eq('ticket_code', code)
    .maybeSingle()

  const ticket = data as { ticket_code: string; secret: string } | null
  if (!ticket || ticket.secret !== secret) {
    return new NextResponse('Not found', { status: 404 })
  }

  const payload = `${getSiteUrl()}/t/${encodeURIComponent(code)}?k=${encodeURIComponent(secret)}`
  const png = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  })

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, max-age=60',
    },
  })
}

import { NextResponse, type NextRequest } from 'next/server'
import { QA_HEADER, qaPressOf } from '@/lib/broadcast/qa-marker'
import { readGoVenue, recordVenueGoPress } from '@/lib/venues/venue-go'
import { venueGoDestination, venueViaOf } from '@/lib/venues/venue-go-math'
import type { GoVenue } from '@/lib/venues/venue-go-math'

/**
 * /go/v/[venue]: one scan of a partner venue's printed code, or one press of its link, counted (venue_go_presses), then
 * the visitor lands on the venue's page on this site (src/lib/venues/venue-go-math.ts holds the rules and why). 302 as
 * /go/[piece] answers; never indexed, never cached, so every press reaches the count. A failed read still lands the
 * visitor on /events (Law 5).
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ venue: string }> }) {
  const { venue: code } = await params
  const via = venueViaOf(request.nextUrl.searchParams.get('via'))
  let venue: GoVenue | null = null
  try {
    venue = await readGoVenue(code)
  } catch (err) {
    console.warn('[go/v] the venue could not be read', err instanceof Error ? err.message : String(err))
  }
  // A verified QA press is recorded as a test; an unverified marker is recorded as neither (qa-marker.ts).
  const qa = await qaPressOf(request.headers.get(QA_HEADER))
  if (venue !== null && qa !== 'refused') {
    await recordVenueGoPress({
      venueId: venue.id,
      via,
      userAgent: request.headers.get('user-agent'),
      ip: request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      isTest: qa === 'test',
    })
  }
  const response = NextResponse.redirect(venueGoDestination(venue?.name ?? null, request.nextUrl.origin, via), 302)
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  response.headers.set('Cache-Control', 'no-store')
  return response
}

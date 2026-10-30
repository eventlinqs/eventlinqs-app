import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { printableHost, getSiteUrl } from '@/lib/site-url'
import { readGoVenue } from '@/lib/venues/venue-go'
import { venueGoUrl } from '@/lib/venues/venue-go-math'
import { buildVenueQrSheet } from '@/lib/venues/venue-qr-sheet'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A partner venue's printable A5 sheet (the project manager's 17:25 of 30 October 2026, D3). Staff, or the venue's own
 * people as the database judges them (public.venue_image_manager, the rule its photographs use). Anyone else, signed in
 * or not, is refused, and an unknown venue reads the same as one they may not print.
 */
async function mayPrint(venueId: string): Promise<boolean> {
  const session = await getAdminSession()
  if (session && can(session, 'admin.venues.manage')) return true
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const admin = createAdminClient()
  const { data, error } = await (admin.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(
    'venue_image_manager',
    { p_user: user.id, p_venue: venueId },
  )
  if (error) throw new Error(`who may print the sheet could not be read: ${error.message}`)
  return data === true
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params
  const refused = NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return refused
  if (!(await mayPrint(id))) return refused
  const venue = await readGoVenue(id)
  if (venue === null) return refused
  const bytes = await buildVenueQrSheet({ venueName: venue.name, url: venueGoUrl(venue.id, getSiteUrl()), host: printableHost() })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="eventlinqs-venue-qr-${venue.id}.pdf"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

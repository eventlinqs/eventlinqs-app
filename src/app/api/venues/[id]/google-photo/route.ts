import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { venueGooglePhoto } from '@/lib/places/venue-google-photo'

/**
 * GET /api/venues/<id>/google-photo?w=<px>: an APPROVED venue's Google photo for ONE view of an event page, with the
 * author credit Google requires. Answered afresh on every request and never stored or cached anywhere ('You cannot
 * cache a photo name'; Places content may not be cached: places/web-service/place-photos and policies, read
 * 31 October 2026). Spend is bounded by the cost guard's daily quota: when it is reached the answer is a plain
 * 'none', and the page keeps its fallback. Lawal's ruling of 30 October 23:56: event detail pages only, never cards.
 */

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NO_STORE = { 'cache-control': 'no-store, max-age=0' }

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID.test(id)) return NextResponse.json({ photo: null, reason: 'not a venue id' }, { status: 404, headers: NO_STORE })
  const asked = Number(new URL(request.url).searchParams.get('w') ?? 1600)
  const width = Number.isFinite(asked) ? Math.min(2400, Math.max(400, Math.round(asked))) : 1600
  const answer = await venueGooglePhoto(createAdminClient(), id, width)
  return answer.ok
    ? NextResponse.json({ photo: answer.photo }, { headers: NO_STORE })
    : NextResponse.json({ photo: null, reason: answer.reason }, { headers: NO_STORE })
}

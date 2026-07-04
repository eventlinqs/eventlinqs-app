import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import {
  SHARE_CHANNELS,
  buildShortUrl,
  getOrCreateShareLink,
  type ShareChannel,
} from '@/lib/broadcast/share-links'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  slug: z.string().min(1).max(200),
  channels: z.array(z.enum(SHARE_CHANNELS)).min(1).max(SHARE_CHANNELS.length).optional(),
})

/** The channels the share bar and share kit mint by default. */
const DEFAULT_CHANNELS: readonly ShareChannel[] = [
  'whatsapp',
  'facebook',
  'x',
  'email',
  'copy',
  'native',
]

/**
 * Mints (or reuses) tracked share links for an event, one per channel, and
 * returns the short URLs. SPEC section 2.3. Anonymous sharers are allowed
 * (created_by null); a signed-in sharer's links are their own rows so a
 * future "your shares" view can credit them.
 *
 * With broadcast_share off this returns links: null and the share surfaces
 * fall back to the untracked long URL: sharing never breaks.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const blocked = await applyRateLimit('share-link-mint', request)
  if (blocked) return blocked

  if (!(await isFeatureEnabled('broadcast_share'))) {
    return NextResponse.json({ ok: true, links: null })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('id, status')
    .eq('slug', parsed.data.slug)
    .maybeSingle()
  if (!event) {
    return NextResponse.json({ ok: false, error: 'event_not_found' }, { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const channels = parsed.data.channels ?? DEFAULT_CHANNELS
  const origin = request.nextUrl.origin
  const links: Record<string, string> = {}
  for (const channel of channels) {
    const link = await getOrCreateShareLink({
      eventId: event.id,
      channel,
      createdBy: user?.id ?? null,
    })
    if (link) links[channel] = buildShortUrl(origin, link.code)
  }

  return NextResponse.json({ ok: true, links })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  revalidateEventSurfacesFromRouteHandlerById,
  revalidateEveryGuideFromRouteHandler,
} from '@/lib/events/revalidate-event'

/**
 * EVERY GUIDE REVALIDATED ON DEMAND, for the callers that are not inside a request of their own (the PM's 19:20 of
 * 11 November 2026): the post-deploy workflow after every production deploy, and a reviewed production write applied
 * from a script (a hold, a release, a correction), which changes what a guide lists without passing through any server
 * action or route handler that could revalidate it.
 *
 * POST, with the cron secret as a bearer token (the same check every cron route uses). The body is optional:
 * { "eventIds": [uuid, ...] } also revalidates each event's own page and every surface it is on.
 */
export const dynamic = 'force-dynamic'

const Body = z.object({ eventIds: z.array(z.string().uuid()).max(100).optional() }).strict()

export async function POST(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const text = await request.text()
  let raw: unknown = {}
  if (text.trim()) {
    try {
      raw = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'the body is not JSON' }, { status: 400 })
    }
  }
  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'expected { "eventIds": [uuid, ...] } with at most 100 ids, or no body' }, { status: 400 })
  }

  const paths = new Set(revalidateEveryGuideFromRouteHandler())
  const ids = parsed.data.eventIds ?? []
  if (ids.length > 0) {
    const admin = createAdminClient()
    for (const id of ids) {
      for (const path of await revalidateEventSurfacesFromRouteHandlerById(admin, id)) paths.add(path)
    }
  }
  return NextResponse.json({ ok: true, revalidated: [...paths], events: ids.length, at: new Date().toISOString() })
}

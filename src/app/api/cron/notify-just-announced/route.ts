import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { dispatchAlert } from '@/lib/notifications/dispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Bound the work a single run will do, so a backlog never runs away.
const MAX_EVENTS = 200
const MAX_DISPATCHES = 1000

/**
 * Just-Announced alert cron (demand engine 3, the biggest lever).
 *
 * For every recently published, public, upcoming event, alert the people who
 * follow that organiser (saved_organisers) once. The notifications table's
 * unique (user, event, type) makes this idempotent, so this can run on a simple
 * schedule without tracking a high-water mark and never double-sends. Push is
 * the primary channel; email is the fallback. Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const admin = createAdminClient()
  const baseUrl = getSiteUrl().replace(/\/$/, '')
  const now = new Date()
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: events, error } = await admin
      .from('events')
      .select('id, title, slug, organisation_id, venue_city, start_date, created_at')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', now.toISOString())
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_EVENTS)

    if (error) {
      console.error('[cron/notify-just-announced] event query failed:', error)
      return NextResponse.json({ error: 'query failed' }, { status: 500 })
    }
    if (!events || events.length === 0) {
      return NextResponse.json({ ok: true, events: 0, sent: 0 })
    }

    const orgIds = [...new Set(events.map((e) => e.organisation_id).filter(Boolean))] as string[]

    // Organiser display names for the alert copy.
    const { data: orgs } = await admin
      .from('organisations')
      .select('id, name')
      .in('id', orgIds)
    const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]))

    // Followers per organisation (a follow is a row in saved_organisers).
    const { data: follows } = await admin
      .from('saved_organisers')
      .select('organisation_id, user_id')
      .in('organisation_id', orgIds)
    const followersByOrg = new Map<string, string[]>()
    for (const f of follows ?? []) {
      if (!f.organisation_id || !f.user_id) continue
      const list = followersByOrg.get(f.organisation_id) ?? []
      list.push(f.user_id)
      followersByOrg.set(f.organisation_id, list)
    }

    let sent = 0
    let dispatches = 0
    outer: for (const event of events) {
      if (!event.organisation_id) continue
      const followers = followersByOrg.get(event.organisation_id) ?? []
      for (const userId of followers) {
        if (dispatches >= MAX_DISPATCHES) break outer
        dispatches += 1
        const result = await dispatchAlert({
          admin,
          userId,
          eventId: event.id,
          type: 'just_announced',
          ctx: {
            eventTitle: event.title,
            eventCity: event.venue_city,
            organiserName: orgName.get(event.organisation_id) ?? null,
            url: `${baseUrl}/events/${event.slug}`,
          },
        })
        if (result.status === 'sent') sent += 1
      }
    }

    return NextResponse.json({
      ok: true,
      events: events.length,
      organisations: orgIds.length,
      dispatches,
      sent,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error('[cron/notify-just-announced] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

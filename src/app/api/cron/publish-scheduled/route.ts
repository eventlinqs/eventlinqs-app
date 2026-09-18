import { NextResponse, type NextRequest } from 'next/server'
import { notifyOrganiserEventPublished } from '@/lib/notifications/organiser-event-notify'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron/auth'
import { publishScheduledEvents } from '@/lib/events/publish-scheduled'
import { revalidateEventSurfacesFromRouteHandlerById } from '@/lib/events/revalidate-event'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Publish the events whose scheduled time has arrived.
 *
 * The wizard has always offered "schedule for later" and nothing ever
 * published anything. This is the missing half. CRON_SECRET guarded and fail
 * closed, like every other cron here.
 *
 * Runs every five minutes: an organiser who schedules for 7pm expects to see
 * it live at 7pm, and five minutes is the resolution at which nobody notices
 * a delay. It is a cheap query against an indexed status column and a handful
 * of rows.
 *
 * Not flag gated, deliberately. Scheduling is not a feature to roll out; it is
 * a promise the wizard already makes on every deploy.
 *
 * ?dry_run=1 reports what WOULD publish and changes nothing.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const admin = createAdminClient()
  const now = new Date()

  if (request.nextUrl.searchParams.get('dry_run') === '1') {
    const { data } = await admin
      .from('events')
      .select('id, slug, title, scheduled_publish_at')
      .eq('status', 'scheduled')
      .not('scheduled_publish_at', 'is', null)
      .lte('scheduled_publish_at', now.toISOString())
      .order('scheduled_publish_at', { ascending: true })
      .limit(100)
    return NextResponse.json({ ok: true, dryRun: true, due: data ?? [] })
  }

  const summary = await publishScheduledEvents(admin, now)

  /*
   * ONLY TOUCH THE CACHE WHEN SOMETHING ACTUALLY CHANGED, AND THEN TOUCH ALL OF
   * IT (close-out SEO3 step 3, 14 September 2026).
   *
   * This block used to be three `revalidatePath` calls: `/`, `/events`, and the
   * event's own page. That is a strictly smaller invalidation than the one EVERY
   * other publish path performs, and the gap is not cosmetic:
   *
   *   - It never cleared the EVENT DATA CACHE TAGS. `loadDiscoveryRows`, the
   *     `/events` grid, the popular ranking, the city and community index counts
   *     and the category list all read through five-minute-to-one-hour caches in
   *     src/lib/events/cache-tags.ts, and a cached row outlives the row. So an
   *     event that went live at 7pm on the schedule the organiser set was absent
   *     from every count until a timer expired.
   *   - It never touched the DISCOVERY SURFACES the event belongs to: its city,
   *     its communities, its category, its organiser, and '/sitemap.xml'. SEO3
   *     step 3 requires that "when an event is published in Melbourne,
   *     /city/melbourne enters the sitemap on the next generation", and a
   *     scheduled publish is a publish. Measured on 14 September 2026: it did
   *     not.
   *
   * `revalidateEventSurfacesFromRouteHandlerById` is the route-handler form of
   * the one function every manual mutation in
   * src/app/(dashboard)/dashboard/events/actions.ts calls, and it reads the row
   * rather than trusting a caller to assemble the fields, which is why it is
   * used here rather than a hand-written list that would drift the same way this
   * one did. A read failure inside it logs and degrades; it never throws, so a
   * cache hint can never turn a completed publish into a 500.
   */
  for (const outcome of summary.outcomes) {
    if (outcome.result === 'published') {
      // The ROUTE HANDLER form, not the server-action one: `updateTag` is
      // Server-Action only in next@16, and a cron GET is a Route Handler. See
      // `revalidateEventSurfacesFromRouteHandler` for the citation and for why
      // `{ expire: 0 }` makes it immediate rather than stale-while-revalidate.
      await revalidateEventSurfacesFromRouteHandlerById(admin, outcome.eventId)

      // MONEY FIX B4. A scheduled publish is a publish, so the organiser hears
      // the same thing they would have heard had they pressed the button. It
      // is awaited rather than fired and forgotten because a cron handler that
      // returns can have its work cut short, and a notification nobody waited
      // for is a notification nobody sent.
      const published = await notifyOrganiserEventPublished({ eventId: outcome.eventId })
      if (published.status === 'skipped') {
        console.warn(
          `[cron/publish-scheduled] organiser not told about ${outcome.slug}: ${published.reason}`,
        )
      }
    }
  }

  // A blocked event is an organiser who thinks they are going live and is not.
  // It stays scheduled rather than being dropped, and it is logged loudly so
  // it can be surfaced to them rather than discovered on the night.
  for (const outcome of summary.outcomes) {
    if (outcome.result !== 'published') {
      console.error(
        `[cron/publish-scheduled] ${outcome.result} ${outcome.slug}: ${outcome.reason ?? 'unknown'}`,
      )
    }
  }

  return NextResponse.json({ ok: true, ...summary })
}

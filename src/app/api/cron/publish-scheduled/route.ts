import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron/auth'
import { revalidatePath } from 'next/cache'
import { publishScheduledEvents } from '@/lib/events/publish-scheduled'

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

  // Only touch the cache when something actually changed.
  if (summary.published > 0) {
    revalidatePath('/')
    revalidatePath('/events')
    for (const outcome of summary.outcomes) {
      if (outcome.result === 'published') revalidatePath(`/events/${outcome.slug}`)
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

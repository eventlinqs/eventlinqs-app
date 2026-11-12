import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NOT_LIVE_FILTER, SUBMISSION_LIVE_WITHIN_MINUTES } from '@/lib/listings/submission-watch-rule'
import { readWeeklyDigest } from '@/lib/growth/weekly-report-digest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * THE FOUR NUMBERS THE DAILY STATE EMAIL CARRIES. Close-out UX4.1.
 *
 * "events live, tickets sold, new organisers" is the last line of what UX4.1
 * asks the daily message to say, and it is the only part of that message that
 * cannot be read from GitHub or from Vercel. It has to come from the platform
 * itself.
 *
 * WHY IT IS NOT A CRON, AND WHY IT IS AUTHED LIKE ONE. Nothing schedules this;
 * `scripts/ops/state-report.mjs` asks it a question once a day from a GitHub
 * Actions runner. It sits under /api/ops rather than /api/cron precisely so
 * that `scripts/guards/cron-routes-scheduled.mjs` keeps its rule simple: every
 * route under /api/cron is on a schedule, no exceptions to argue about.
 *
 * It reuses CRON_SECRET rather than minting a credential. That secret is
 * ALREADY a repository secret in GitHub Actions, so the daily email costs the
 * owner no new environment variable, no new dashboard visit and no new rotation
 * procedure (Law 10: hand him nothing a machine can avoid handing him).
 * `requireCronAuth` fails CLOSED, so an environment without the secret refuses
 * rather than publishing counts.
 *
 * READ ONLY. It counts and returns; it writes nothing and can change nothing.
 *
 * WHAT EACH NUMBER MEANS, stated here because a count with an unstated
 * definition drifts the first time somebody else needs one:
 *   eventsLive        events whose status is `published`. That is the platform's
 *                     own definition of a live listing; a draft is not live and
 *                     an archived one is not either.
 *   ticketsSold       every ticket row that has not been refunded, ever.
 *   ticketsSold24h    the same, created in the last 24 hours.
 *   ordersPaid24h     orders that reached `confirmed` in the last 24 hours.
 *                     `confirmed` is the status the Stripe webhook sets when the
 *                     money has actually been taken.
 *   newOrganisers24h  organisations created in the last 24 hours.
 *   submissionsNotLive  organiser submissions neither live nor refused an hour after
 *                     they arrived (src/lib/listings/submission-watch-rule.ts). The
 *                     target is 0; the daily email marks any other number (the PM's
 *                     ruling of 8 November 2026, 15:00).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  try {
    const hourAgo = new Date(Date.now() - SUBMISSION_LIVE_WITHIN_MINUTES * 60_000).toISOString()
    const [live, tickets, tickets24, orders24, organisations24, notLive] = await Promise.all([
      admin.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      admin.from('tickets').select('id', { count: 'exact', head: true }).is('refunded_at', null),
      admin.from('tickets').select('id', { count: 'exact', head: true }).is('refunded_at', null).gte('created_at', since),
      admin.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'confirmed').gte('confirmed_at', since),
      admin.from('organisations').select('id', { count: 'exact', head: true }).gte('created_at', since),
      admin.from('listing_submissions').select('id', { count: 'exact', head: true }).or(NOT_LIVE_FILTER).lt('created_at', hourAgo),
    ])

    const failed = [live, tickets, tickets24, orders24, organisations24, notLive].find((r) => r.error)
    if (failed?.error) {
      // Named, never swallowed. A daily state that quietly reports zero events
      // live would be worse than one that says it could not count them.
      console.error('[api/ops/state] a count failed:', failed.error.message)
      return NextResponse.json({ ok: false, error: failed.error.message }, { status: 500 })
    }

    // THE WEEKLY REPORT'S MONDAY COPY (order 4, Release 3; src/lib/growth/weekly-report-digest.ts): only when the morning
    // run asks (?weekly=1, on a Melbourne Monday), so the hourly stall check never pays for it; its own failure is said
    // in its own field and never fails the counts above.
    const weekly = request.nextUrl.searchParams.get('weekly') === '1' ? await readWeeklyDigest(admin) : undefined

    return NextResponse.json({
      ok: true,
      since,
      ...(weekly ? { weekly } : {}),
      counts: {
        eventsLive: live.count ?? 0,
        ticketsSold: tickets.count ?? 0,
        ticketsSold24h: tickets24.count ?? 0,
        ordersPaid24h: orders24.count ?? 0,
        newOrganisers24h: organisations24.count ?? 0,
        submissionsNotLive: notLive.count ?? 0,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/ops/state] failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

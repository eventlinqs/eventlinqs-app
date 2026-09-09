import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'

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
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const admin = createAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  try {
    const [live, tickets, tickets24, orders24, organisations24] = await Promise.all([
      admin.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published'),
      admin.from('tickets').select('id', { count: 'exact', head: true }).is('refunded_at', null),
      admin.from('tickets').select('id', { count: 'exact', head: true }).is('refunded_at', null).gte('created_at', since),
      admin.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'confirmed').gte('confirmed_at', since),
      admin.from('organisations').select('id', { count: 'exact', head: true }).gte('created_at', since),
    ])

    const failed = [live, tickets, tickets24, orders24, organisations24].find((r) => r.error)
    if (failed?.error) {
      // Named, never swallowed. A daily state that quietly reports zero events
      // live would be worse than one that says it could not count them.
      console.error('[api/ops/state] a count failed:', failed.error.message)
      return NextResponse.json({ ok: false, error: failed.error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      since,
      counts: {
        eventsLive: live.count ?? 0,
        ticketsSold: tickets.count ?? 0,
        ticketsSold24h: tickets24.count ?? 0,
        ordersPaid24h: orders24.count ?? 0,
        newOrganisers24h: organisations24.count ?? 0,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/ops/state] failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NOT_LIVE_FILTER, SUBMISSION_LIVE_WITHIN_MINUTES } from '@/lib/listings/submission-watch-rule'
import { readMorningReport } from '@/lib/admin/morning-report'
import { readWeeklyDigest } from '@/lib/growth/weekly-report-digest'
import { SOURCE_STOP_WORDS } from '@/lib/health/dead-link-hold'
import { NOT_AN_EVENT } from '@/lib/listings/not-an-event'

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
 *                     an archived one is not either. Never a test night.
 *   ticketsSold       every ticket row that has not been refunded, ever, of an
 *                     order that is not a test order.
 *   ticketsSold24h    the same, created in the last 24 hours.
 *   ordersPaid24h     orders that reached `confirmed` in the last 24 hours with
 *                     money in them (total over $0), never a test order. A free
 *                     registration is confirmed too, and is not a paid order.
 *   newOrganisers24h  organisations created in the last 24 hours, never a test one.
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
    // A TEST ACCOUNT'S BUSINESS IS NEVER A FIGURE (migration 20261121140001; the PM's 22:50 of 28 November 2026, fix (d)):
    // the 13:58 email of 28 November counted six QA journey orders, $0 each, as "6 paid orders" and their tickets as sold.
    // Every count leaves is_test out (a ticket through its order), and a paid order is one that took money.
    const [live, tickets, tickets24, orders24, organisations24, notLive, stoppedDead, ruled, notEvents] = await Promise.all([
      admin.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('is_test', false),
      admin.from('tickets').select('id, orders!inner(is_test)', { count: 'exact', head: true }).is('refunded_at', null).eq('orders.is_test', false),
      admin.from('tickets').select('id, orders!inner(is_test)', { count: 'exact', head: true }).is('refunded_at', null).eq('orders.is_test', false).gte('created_at', since),
      admin.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'confirmed').eq('is_test', false).gt('total_cents', 0).gte('confirmed_at', since),
      admin.from('organisations').select('id', { count: 'exact', head: true }).eq('is_test', false).gte('created_at', since),
      admin.from('listing_submissions').select('id', { count: 'exact', head: true }).or(NOT_LIVE_FILTER).lt('created_at', hourAgo),
      // The sources the visitor sentinel switched off for dead booking links in the last day (law 19 (d); the PM's 12:25
      // item 3 of 16 November 2026: 'Lawal's daily email says so in one line').
      admin.from('listing_sources').select('name').gte('stopped_at', since).ilike('stopped_because', `%${SOURCE_STOP_WORDS}%`).limit(50),
      // The nights a rule published in the last day, by source, so a flood is seen (the PM's 13:40 item 1 of 16 November
      // 2026: the libraries' nights publish through the capture rule).
      admin.from('listing_candidates').select('source_id').eq('decided_by', 'partner_rule').not('published_series_id', 'is', null).gte('reviewed_at', since).limit(5000),
      // Facility notices the collection run kept off as not an event in the last day (the PM's 15:38 item 1).
      admin.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('status', 'refused').ilike('refused_because', `${NOT_AN_EVENT}%`).gte('reviewed_at', since),
    ])

    const failed = [live, tickets, tickets24, orders24, organisations24, notLive, stoppedDead, ruled, notEvents].find((r) => r.error)
    if (failed?.error) {
      // Named, never swallowed. A daily state that quietly reports zero events
      // live would be worse than one that says it could not count them.
      console.error('[api/ops/state] a count failed:', failed.error.message)
      return NextResponse.json({ ok: false, error: failed.error.message }, { status: 500 })
    }

    const ruledBySource = new Map<string, number>()
    for (const r of (ruled.data ?? []) as { source_id: string }[]) ruledBySource.set(r.source_id, (ruledBySource.get(r.source_id) ?? 0) + 1)
    const ruledNames = ruledBySource.size === 0 ? { data: [] as { id: string; name: string }[], error: null } : await admin.from('listing_sources').select('id, name').in('id', [...ruledBySource.keys()])
    if (ruledNames.error) {
      console.error('[api/ops/state] a count failed:', ruledNames.error.message)
      return NextResponse.json({ ok: false, error: ruledNames.error.message }, { status: 500 })
    }
    const nameOf = new Map(((ruledNames.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]))
    const rulePublishedBySource24h = [...ruledBySource.entries()].map(([id, n]) => ({ name: nameOf.get(id) ?? 'a source', n })).sort((a, b) => b.n - a.n)

    // THE WEEKLY REPORT'S MONDAY COPY (order 4, Release 3; src/lib/growth/weekly-report-digest.ts): only when the morning
    // run asks (?weekly=1, on a Melbourne Monday), so the hourly stall check never pays for it; its own failure is said
    // in its own field and never fails the counts above.
    const weekly = request.nextUrl.searchParams.get('weekly') === '1' ? await readWeeklyDigest(admin) : undefined
    // THE 08:00 REPORT'S SEVEN PARTS (car D, part 2; the operating model, section 10; law 25): only when the morning run
    // asks (?business=1), so the hourly stall check never pays for them; each area that cannot be read says so in its own
    // row, and a fault of the whole read is said in its own field and never fails the counts above.
    const business =
      request.nextUrl.searchParams.get('business') === '1'
        ? await readMorningReport().catch((fault: unknown) => ({ error: fault instanceof Error ? fault.message : String(fault) }))
        : undefined

    return NextResponse.json({
      ok: true,
      since,
      ...(weekly ? { weekly } : {}),
      ...(business ? { business } : {}),
      counts: {
        eventsLive: live.count ?? 0,
        ticketsSold: tickets.count ?? 0,
        ticketsSold24h: tickets24.count ?? 0,
        ordersPaid24h: orders24.count ?? 0,
        newOrganisers24h: organisations24.count ?? 0,
        submissionsNotLive: notLive.count ?? 0,
        sourcesStoppedDeadLinks24h: ((stoppedDead.data ?? []) as { name: string }[]).map((s) => s.name),
        rulePublishedBySource24h,
        notEvents24h: notEvents.count ?? 0,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/ops/state] failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

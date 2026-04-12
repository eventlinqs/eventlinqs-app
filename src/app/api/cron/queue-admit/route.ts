import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Cron route: runs every minute via Vercel Crons.
 *
 * 1. Fetches all published high-demand events whose queue is currently open.
 * 2. For each event, calls admit_queue_batch() RPC — atomically moves the next
 *    N waiting entries to 'admitted' and sets their expires_at window.
 * 3. Calls expire_stale_queue_admissions() — globally marks any 'admitted'
 *    entries whose window has elapsed back to 'expired'.
 *
 * Protected by CRON_SECRET to prevent public triggering.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const admin = createAdminClient()

  try {
    // Step 1: Expire stale admitted entries (globally, before admitting new ones)
    const { error: expireError } = await admin.rpc('expire_stale_queue_admissions')
    if (expireError) {
      console.error('[cron/queue-admit] expire_stale_queue_admissions error:', expireError)
      return NextResponse.json({ error: 'Expire RPC failed' }, { status: 500 })
    }

    // Step 2: Find all high-demand events with an open queue
    const now = new Date().toISOString()
    const { data: events, error: eventsError } = await admin
      .from('events')
      .select('id, title, queue_admission_rate, queue_admission_window_minutes')
      .eq('is_high_demand', true)
      .eq('status', 'published')
      .lte('queue_open_at', now)

    if (eventsError) {
      console.error('[cron/queue-admit] failed to fetch active queue events:', eventsError)
      return NextResponse.json({ error: 'Events fetch failed' }, { status: 500 })
    }

    if (!events || events.length === 0) {
      return NextResponse.json({ ok: true, admitted: 0, events: 0, timestamp: now })
    }

    // Step 3: Admit a batch for each active event
    let totalAdmitted = 0
    for (const event of events) {
      const { data: admitted, error: admitError } = await admin.rpc('admit_queue_batch', {
        p_event_id: event.id,
        p_batch_size: event.queue_admission_rate,
        p_admission_window_minutes: event.queue_admission_window_minutes,
      })

      if (admitError) {
        console.error(`[cron/queue-admit] admit_queue_batch error for event ${event.id}:`, admitError)
        continue
      }

      const count = (admitted as number) ?? 0
      console.log(`[cron/queue-admit] admitted ${count} for event "${event.title}" (${event.id})`)
      totalAdmitted += count
    }

    return NextResponse.json({
      ok: true,
      admitted: totalAdmitted,
      events: events.length,
      timestamp: now,
    })
  } catch (err) {
    console.error('[cron/queue-admit] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

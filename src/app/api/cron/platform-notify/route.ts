import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  dispatchPendingPlatformNotifications,
  sendHeldDigest,
} from '@/lib/notifications/platform-send'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * THE OWNER'S NOTIFICATION WORKER. Close-out UX3.
 *
 * The five state changes write their record inside their own transaction (a
 * database trigger, so no writer can forget). This route is the only thing that
 * turns those records into something that arrives: it sends, retries, escalates
 * to the second channel, and rolls the overflow into a digest.
 *
 * Every minute, because "a real organiser published a paid event and the owner
 * found out the next day by opening the website" is the defect being fixed and a
 * fifteen-minute schedule would still be an hour late by the time a retry ran.
 *
 * The digest runs AFTER the dispatcher in the same tick, so a run that pushes
 * orders past the daily ceiling also clears the overflow it just created.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const admin = createAdminClient()
  try {
    const dispatched = await dispatchPendingPlatformNotifications({ admin })
    const digest = await sendHeldDigest({ admin })
    console.log(
      `[cron/platform-notify] considered ${dispatched.considered}, sent ${dispatched.sent}, ` +
        `held ${dispatched.held}, retried ${dispatched.retried}, escalated ${dispatched.escalated}, ` +
        `failed ${dispatched.failed}; digest held ${digest.held}, sent ${digest.sent}, ` +
        `escalated ${digest.escalated}, failed ${digest.failed}`,
    )
    return NextResponse.json({ ok: true, dispatched, digest })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cron/platform-notify] run failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

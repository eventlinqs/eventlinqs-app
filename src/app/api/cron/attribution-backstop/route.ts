import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { healUnrecordedOrders } from '@/lib/attribution/backstop'

export const dynamic = 'force-dynamic'

/**
 * THE ATTRIBUTION BACKSTOP. GA3's invariant, kept true by the platform.
 *
 * Every order carries exactly one stored attribution decision. The write-time
 * path does that at checkout; this repairs the ones it missed, and the reasons
 * it can miss are written out in `lib/attribution/backstop`. Before this route
 * existed the only thing defending the invariant on production was a build
 * guard that production never runs, and an ops script a person runs by hand
 * after a build goes red somewhere else.
 *
 * WHY HOURLY. An unrecorded order costs nothing until somebody runs an invoice
 * or a report against it, so minutes do not matter and reads do. The resolution
 * window means a run finding nothing is the normal case, and on a sound
 * platform this does one read and stops.
 *
 * WHY A FAILURE IS A 500 AND NOT AN EMPTY SUCCESS. A backstop that answers
 * "nothing to heal" because it could not reach the database hides exactly the
 * thing it exists to find, and what it hides is a gap in an invoice.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const result = await healUnrecordedOrders()
    console.log(
      `[cron/attribution-backstop] ${result.unrecorded} order(s) with no record, ` +
        `${result.withinGrace} still inside the resolution window, ` +
        `attempted ${result.attempted}, healed ${result.healed}.`,
    )
    if (result.unhealed.length > 0) {
      console.error(
        `[cron/attribution-backstop] ${result.unhealed.length} order(s) are STILL unrecorded after a repair attempt: ` +
          `${result.unhealed.join(', ')}. Each is a sale with no stored decision.`,
      )
    }
    if (result.capped) {
      console.error(
        `[cron/attribution-backstop] the per-run cap was reached, so more remain than this run repaired. ` +
          `A backlog that persists across runs is a fault in the write-time path, not in this one.`,
      )
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/attribution-backstop] failed:', err)
    return NextResponse.json({ error: 'attribution backstop failed' }, { status: 500 })
  }
}

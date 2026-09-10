import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { sweepAbandonedCheckouts } from '@/lib/fillrate/engine'
import { eventLinqsLinks } from '@/lib/recovery/links'
import { sendingRates } from '@/lib/fillrate/rates'

export const dynamic = 'force-dynamic'

/**
 * THE RECOVERY SWEEP. Close-out D2, the first of the three things.
 *
 * Between 60 and 80 percent of people who start a checkout do not finish, over
 * 85 percent on mobile, and up to 20 percent of those are recoverable by an
 * automated sequence. This is that sequence: three messages at 2, 24 and 72
 * hours to somebody who typed their address and then did not buy.
 *
 * WHY HOURLY RATHER THAN EVERY MINUTE. The schedule's finest grain is two hours,
 * so a minute-by-minute sweep would do the same reads sixty times to change
 * nothing. `messageDueFor` sends the LATEST due message rather than the earliest,
 * so a sweep that misses a tick does not then walk somebody through three
 * messages in three minutes to catch up.
 *
 * WHY THE REVERSAL CONDITION IS READ HERE. D2 sets it out: above 2 percent
 * unsubscribes or 0.1 percent complaints the sequence cuts to one message, and
 * above 0.3 percent complaints it stops entirely. Those are rates over what was
 * actually sent, so they are measured from the engine's own record on every run
 * rather than configured, and the answer is reported in the response so a run
 * that sent nothing says why.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const rates = await sendingRates()
    const result = await sweepAbandonedCheckouts(eventLinqsLinks, new Date(), rates)
    console.log(
      `[cron/recovery-sweep] ${result.slotsConsidered} slot(s), sent ${result.sent}, refused ${result.refused}, failed ${result.failed}. Sequence: ${result.sequenceReason}`,
    )
    for (const [reason, count] of Object.entries(result.refusals)) {
      console.log(`[cron/recovery-sweep]   ${count} x ${reason}`)
    }
    return NextResponse.json({ ok: true, ...result, rates })
  } catch (err) {
    console.error('[cron/recovery-sweep] failed:', err)
    return NextResponse.json({ error: 'recovery sweep failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { sweepAbandonedCheckouts } from '@/lib/fillrate/engine'
import { eventLinqsLinks } from '@/lib/recovery/links'
import { syncConsentStopsIntoRecovery } from '@/lib/recovery/consent-stops'
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
    /*
     * WHO HAS SAID STOP, BEFORE ANYTHING ASKS WHO TO WRITE TO.
     *
     * The engine reads only its own suppression table (close-out D2), so a
     * withdrawal recorded in EventLinqs' consent ledger never reached it: not
     * from the preferences page, not from the digest unsubscribe page, not from
     * the Gmail one-click button. 147 people were on the ledger and 19 were on
     * the engine's list. This reconciles the two, immediately before the sweep
     * that reads the list, so the window in which they can disagree is one run.
     *
     * IT IS DELIBERATELY NOT IN THE `try` BELOW AS SOMETHING TO SHRUG OFF. It
     * throws on a partial read, and a sweep that could not establish who has
     * unsubscribed must not then decide who to mail: that is the one failure
     * where carrying on sends mail to people who asked for none. The catch
     * answers 500 and the next hourly run tries again, having sent nothing.
     */
    const stops = await syncConsentStopsIntoRecovery()
    console.log(
      `[cron/recovery-sweep] consent stops: ${stops.stopped} on the ledger, ${stops.added} newly copied in, ${stops.alreadyHeld} already held`,
    )

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

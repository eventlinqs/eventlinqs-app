import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { runReminderPasses } from '@/lib/walk-in/reminder-sends'
import { reminderStore } from '@/lib/walk-in/reminder-store'

export const dynamic = 'force-dynamic'

/**
 * REMIND ME, SENT (WI1). Hourly.
 *
 * Two passes: the program update owed to everyone who asked before an organiser
 * published the full program, then the day-before reminders now due in each
 * event's own zone. Each message is claimed before it is sent, so this run, an
 * overlapping run and a retry can never send a second copy
 * (src/lib/walk-in/reminder-sends.ts holds the rules and the reasons).
 *
 * HOURLY, because the day-before reminder becomes due at 9am in each event's own
 * zone and the platform spans several; and because the program update is sent at
 * once by the organiser's own press, with this run as the backstop if that send
 * did not finish.
 *
 * Remind me's switch does not stop this run. Turning the switch off stops new
 * requests; it does not withdraw a message somebody already asked for.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const result = await runReminderPasses(reminderStore(), new Date())
    console.log(
      `[cron/walk-in-reminders] program: ${result.program.sent} sent, ${result.program.failed} failed, ${result.program.alreadyClaimed} already claimed; ` +
        `day before: ${result.dayBefore.sent} sent, ${result.dayBefore.failed} failed, ${result.dayBefore.alreadyClaimed} already claimed; ` +
        `${result.purged} request(s) past retention deleted`,
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/walk-in-reminders] failed:', err)
    return NextResponse.json({ error: 'walk-in reminders failed' }, { status: 500 })
  }
}

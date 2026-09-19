import { NextResponse, type NextRequest } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { applyRateLimit } from '@/lib/rate-limit/middleware'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { alertDestination } from '@/lib/env/destinations'
import {
  scanPlatformSettlement,
  describeSettlementFindings,
} from '@/lib/payments/platform-settlement-reconcile'
import { listSettledPlatformCharges } from '@/lib/stripe/settled-charges'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * DAILY: every charge that settled on the platform balance, checked against the
 * platform's own statement of what it owes onward.
 *
 * MONEY FIX A3 LAYER THREE. The rule, the reason the item's literal wording had
 * to be inverted to be buildable, and how a charge is identified all live in
 * src/lib/payments/platform-settlement-reconcile.ts. This route is the
 * scheduled caller and the alert; it decides nothing.
 *
 * WHAT RED MEANS. A 503 with findings means money reached the platform's own
 * balance that the platform does not record as owed to any organiser. That is
 * the MKLStudios condition of 10 September 2026, in which A$52.48 of organiser
 * revenue settled into the platform account and the organiser was told nothing
 * by anyone. It is always worth a human, immediately.
 *
 * IT MOVES NO MONEY AND REPAIRS NOTHING. See the module header. The response
 * says `wrote: false` in its own payload so nobody reading a red response has
 * to wonder whether it also helpfully corrected something.
 *
 * THE P0 LINE IN REVIEW-QUEUE.md is produced by the same rule from
 * scripts/verify/platform-settlement-reconcile.mjs, which is the operator-side
 * caller: a function running on Vercel cannot write a file on the founder's
 * machine, so the route raises the alarm by mail and the script writes the
 * record. One rule, two callers, exactly as the aggregate reconciliation does.
 *
 * SCHEDULING lives in vercel.json and is not written here, because a cron
 * expression contains the two characters that end a block comment. The guard
 * scripts/guards/cron-routes-scheduled.mjs fails the build if the entry is lost.
 */

const ALERT_TO = () => alertDestination()

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const blocked = await applyRateLimit('cron-job', request)
  if (blocked) return blocked

  let report
  try {
    report = await scanPlatformSettlement(createAdminClient(), {
      listCharges: async (window) => (await listSettledPlatformCharges(window)).charges,
    })
  } catch (err) {
    console.error('[cron/platform-settlement-reconcile] scan failed', { err })
    return NextResponse.json({ ok: false, error: 'scan_failed' }, { status: 500 })
  }

  const red = report.findings.length > 0
  const block = describeSettlementFindings(report, new Date().toISOString())

  console.log(
    `[cron/platform-settlement-reconcile] ${red ? 'RED' : 'GREEN'} ` +
      `checked=${report.checked} owedOnward=${report.owedOnward} findings=${report.findings.length} ` +
      `window=${report.window.sinceIso}..${report.window.untilIso}` +
      (block ? `\n${block}` : ''),
  )

  let alerted = false
  if (red) {
    const body =
      `Money settled on the EventLinqs platform balance that the platform does not record as owed onward.\n\n` +
      `This is the class of fault that left A$52.48 of MKLStudios revenue in the platform account on\n` +
      `10 September 2026 with no record that it was owed to anybody.\n` +
      `${block}\n` +
      `WHAT TO DO. Match each charge id in the Stripe dashboard. If it belongs to an order, the\n` +
      `order_confirmed ledger row is missing and the webhook that writes it needs reading. If it\n` +
      `carries no transfer_group it was not created by the ticket path at all, and what created it\n` +
      `is the question.\n\n` +
      `NOTHING WAS MOVED AND NOTHING WAS REPAIRED. This reconciliation only reads.\n\n` +
      `EventLinqs platform settlement reconciliation`
    try {
      await sendEmail({
        to: ALERT_TO(),
        subject: `P0 money: ${report.findings.length} charge(s) on the platform balance are not recorded as owed onward`,
        messageType: 'platform_settlement_unrouted',
        recipientRole: 'platform_owner',
        text: body,
        html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(body)}</pre>`,
      })
      alerted = true
    } catch (err) {
      console.error('[cron/platform-settlement-reconcile] alert email failed:', err)
    }
  }

  return NextResponse.json(
    {
      ok: !red,
      window: report.window,
      checked: report.checked,
      owedOnward: report.owedOnward,
      findings: report.findings,
      alerted,
      wrote: false,
    },
    { status: red ? 503 : 200 },
  )
}

/**
 * The report carries organisation names, which are organiser-supplied text, and
 * they go into an HTML mail. Escaped rather than trusted.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

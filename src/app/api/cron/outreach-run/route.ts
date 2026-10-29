import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { graphConfigFromEnv, graphReadInbox } from '@/lib/outreach/graph'
import { handleInbox } from '@/lib/outreach/replies'
import { planDms, planPlays, planRelationship } from '@/lib/outreach/planner'
import { runOutreachSender } from '@/lib/outreach/sender'
import { recordSendingDomainCheck } from '@/lib/outreach/dns-check'

/**
 * THE OUTREACH RUN, EVERY 15 MINUTES (window 6, 28 October 2026; the engine plan's FULL AUTOMATION).
 *
 * In order, each step reported:
 *   1. the SPF, DKIM and DMARC check, when the last is older than six hours (outreach_sender cannot go live on a check
 *      older than seven days);
 *   2. replies: the inbox read through Graph for the last two days (each message handled once, by its id), stops and
 *      clear answers acted on, anything unclear left for Lawal;
 *   3. the plays Lawal approved draft what is due, within each play's cap for the day, and the DMs Lawal sends by hand
 *      are drafted and held for him (never sent by the system);
 *   4. the sender sends what is queued, inside the recipient's business hours, as the sender's mode allows.
 *
 * With the sender on HOLD (its default) steps 2 to 4 claim and send nothing. Steps 2 and 3 act in the name of the
 * person who last set the sender's mode (outreach_sender.changed_by); until someone has, they do not run.
 */

export const dynamic = 'force-dynamic'

const DNS_EVERY_MS = 6 * 3_600_000
const INBOX_LOOKBACK_MS = 2 * 86_400_000

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const now = new Date()
  const db = createAdminClient()
  const origin = getSiteUrl()
  try {
    const sender = await db.from('outreach_sender').select('mode, from_address, changed_by, dns_checked_at').eq('id', true).single()
    if (sender.error) throw new Error(`outreach_sender: ${sender.error.message}`)

    const dns =
      !sender.data.dns_checked_at || now.getTime() - new Date(sender.data.dns_checked_at).getTime() > DNS_EVERY_MS
        ? await recordSendingDomainCheck(db)
        : 'checked within six hours'

    const graph = graphConfigFromEnv(sender.data.from_address)
    const actingUser = sender.data.changed_by
    let inbox: unknown = 'not read: no Graph credentials'
    let plays: unknown = 'not planned: no person has set the sender'
    let dms: unknown = 'not drafted: no person has set the sender'
    let partners: unknown = 'not drafted: no person has set the sender'
    if (sender.data.mode !== 'hold' && actingUser) {
      if (graph) {
        const messages = await graphReadInbox(graph, new Date(now.getTime() - INBOX_LOOKBACK_MS).toISOString())
        inbox = await handleInbox(db, messages, { mailbox: sender.data.from_address, origin, actingUser, now })
      }
      plays = await planPlays(db, { now, origin, actingUser })
      dms = await planDms(db, { now, origin, actingUser })
      partners = await planRelationship(db, { now, origin, actingUser })
    } else if (sender.data.mode === 'hold') {
      inbox = 'not read: the sender is on hold'
      plays = 'not planned: the sender is on hold'
      dms = 'not drafted: the sender is on hold'
      partners = 'not drafted: the sender is on hold'
    }

    const sent = await runOutreachSender(db, { now, origin, graph })
    console.log(`[cron/outreach-run] mode ${sent.mode}: ${sent.sent.length} sent, ${sent.failed.length} failed, ${sent.refused.length} refused, ${sent.outsideHours} outside hours`)
    return NextResponse.json({ ok: true, dns, inbox, plays, dms, partners, sent })
  } catch (err) {
    console.error('[cron/outreach-run] failed:', err)
    return NextResponse.json({ error: 'outreach run failed' }, { status: 500 })
  }
}

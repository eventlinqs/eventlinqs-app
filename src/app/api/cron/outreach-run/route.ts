import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { graphConfigFromEnv, graphReadInbox } from '@/lib/outreach/graph'
import { handleInbox } from '@/lib/outreach/replies'
import { judgePlays, planDms, planPlays, planRelationship } from '@/lib/outreach/planner'
import { runOutreachSender } from '@/lib/outreach/sender'
import { recordSendingDomainCheck } from '@/lib/outreach/dns-check'
import { syncGrowthTasks } from '@/lib/crm/tasks'
import { draftTheTwenty, founderAccount } from '@/lib/outreach/twenty-drafts'
import { syncSentItems } from '@/lib/outreach/sent-sync'
import { draftTheSpotlight } from '@/lib/social/three-posts'

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
 *   4. the sender sends what is queued, inside the recipient's business hours, as the sender's mode allows;
 *   5. every organiser's acquisition state is refreshed from its proof (organiser_acquisition_refresh_all, migration
 *      20261030034001). The states a night moves (qualified, active, recurring) have no trigger on events, so this is
 *      what moves them. It writes no message, so it runs whatever the sender's mode; a fault in it is reported in the
 *      answer and never stops the steps before it.
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
    let judged: unknown = 'not judged: no person has set the sender'
    let dms: unknown = 'not drafted: no person has set the sender'
    let partners: unknown = 'not drafted: no person has set the sender'
    if (sender.data.mode !== 'hold' && actingUser) {
      if (graph) {
        const messages = await graphReadInbox(graph, new Date(now.getTime() - INBOX_LOOKBACK_MS).toISOString())
        inbox = await handleInbox(db, messages, { mailbox: sender.data.from_address, origin, actingUser, now })
      }
      // The learning loop judges each play's test once, before the plan, so the winner is drafted from the same run.
      judged = await judgePlays(db, now)
      plays = await planPlays(db, { now, origin, actingUser })
      dms = await planDms(db, { now, origin, actingUser })
      partners = await planRelationship(db, { now, origin, actingUser })
    } else if (sender.data.mode === 'hold') {
      inbox = 'not read: the sender is on hold'
      plays = 'not planned: the sender is on hold'
      judged = 'not judged: the sender is on hold'
      dms = 'not drafted: the sender is on hold'
      partners = 'not drafted: the sender is on hold'
    }

    const sent = await runOutreachSender(db, { now, origin, graph })
    console.log(`[cron/outreach-run] mode ${sent.mode}: ${sent.sent.length} sent, ${sent.failed.length} failed, ${sent.refused.length} refused, ${sent.outsideHours} outside hours`)

    const refreshed = await db.rpc('organiser_acquisition_refresh_all', { p_proved_by: 'outreach-run' })
    const acquisition = refreshed.error ? { error: refreshed.error.message } : { changed: refreshed.data }
    if (refreshed.error) console.error('[cron/outreach-run] acquisition states not refreshed:', refreshed.error.message)

    // THE GROWTH OS'S TASKS (Release 1): every item that waits for a person kept as a task with its status, owner and due
    // date, and closed when resolved at its source (src/lib/crm/tasks.ts). In this run, never a cron of its own. A failure
    // here is reported in the answer and logged, and never stops the run above, which has already done its work.
    let tasks: unknown
    try {
      tasks = await syncGrowthTasks(db, now)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[cron/outreach-run] growth tasks not kept:', message)
      tasks = { error: message }
    }
    // TOMORROW'S TWENTY (Lawal's 11:11 and the PM's 11:58 of 12 November 2026): the day's conversion asks and first
    // messages drafted HELD in his October format from verified rows (src/lib/outreach/twenty-drafts.ts), in the first
    // run of each hour only, so the twenty is read 24 times a day, not 96. Nothing is sent; a failure is reported and
    // logged and never stops the run above.
    let twenty: unknown = 'not drafted in this run: the first run of each hour drafts'
    let spotlight: unknown = 'not drafted in this run: the first run of each hour drafts'
    if (now.getUTCMinutes() < 15) {
      try {
        twenty = await draftTheTwenty(db, { now, origin })
        console.log(`[cron/outreach-run] the twenty: ${JSON.stringify(twenty)}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/outreach-run] the twenty not drafted:', message)
        twenty = { error: message }
      }
      // The week's organiser spotlight drafted the same hour (src/lib/social/three-posts.ts), in the founder's name.
      try {
        const founder = await founderAccount(db)
        spotlight = founder.id === null ? `not drafted: ${founder.why}` : await draftTheSpotlight(db, { now, plannedBy: founder.id })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/outreach-run] the spotlight not drafted:', message)
        spotlight = { error: message }
      }
    }
    // LAWAL'S SENT ITEMS (Release 2, item 5): what he sent from the outreach mailbox, recorded on each organiser's
    // timeline (src/lib/outreach/sent-sync.ts). Reading only, so it runs while the sender is on hold too, once Graph can
    // read the mailbox; nothing sends. A failure is reported and logged and never stops the run above.
    let sentItems: unknown = 'not synced: no Graph credentials'
    if (graph) {
      try {
        sentItems = await syncSentItems(db, graph, { sinceIso: new Date(now.getTime() - INBOX_LOOKBACK_MS).toISOString() })
        console.log(`[cron/outreach-run] sent items: ${JSON.stringify(sentItems)}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/outreach-run] sent items not synced:', message)
        sentItems = { error: message }
      }
    }
    return NextResponse.json({ ok: true, dns, inbox, judged, plays, dms, partners, sent, acquisition, tasks, twenty, spotlight, sentItems })
  } catch (err) {
    console.error('[cron/outreach-run] failed:', err)
    return NextResponse.json({ error: 'outreach run failed' }, { status: 500 })
  }
}

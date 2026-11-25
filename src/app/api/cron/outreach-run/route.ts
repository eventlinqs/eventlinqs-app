import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { graphConfigFromEnv, graphReadInbox } from '@/lib/outreach/graph'
import { OUR_MAILBOXES } from '@/lib/outreach/addresses'
import { handleInbox, type InboxIntake } from '@/lib/outreach/replies'
import { graphPhotoBytes, graphPhotosOf } from '@/lib/comms/inbound-attachments'
import { mediaDeps } from '@/lib/listings/organiser-media'
import { judgePlays, planDms, planPlays, planRelationship, playDecisionLines, type PlayReport } from '@/lib/outreach/planner'
import { expireLapsedLetters, runOutreachSender } from '@/lib/outreach/sender'
import { queueApprovedHeldLetters, queueApprovedReplies } from '@/lib/outreach/self-queue'
import { recordPhaseRun } from '@/lib/ops/phase-runs'
import { isolated, isStepFault } from '@/lib/ops/isolated'
import { melbourneMinutes, outreachPhaseAt } from '@/lib/ops/timetable'
import { recordMissedRuns } from '@/lib/ops/missed-runs'
import { recordSendingDomainCheck } from '@/lib/outreach/dns-check'
import { syncGrowthTasks } from '@/lib/crm/tasks'
import { TWENTY_ADVICE_DRAFTING, draftTheTwenty, founderAccount, storeSegmentALetters } from '@/lib/outreach/twenty-drafts'
import { draftDay10FollowUps, draftDay4FollowUps } from '@/lib/outreach/follow-ups'
import { syncSentItems } from '@/lib/outreach/sent-sync'
import { draftTheSpotlight } from '@/lib/social/three-posts'
import { basisPoolStore, POOL_HOUR, POOL_MINUTE_FROM, poolCapFor, runBasisPool, weekFirstLetters } from '@/lib/outreach/basis-pool'
import { engineRecheckStore, recheckUnticked } from '@/lib/outreach/engine-recheck'

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
const RUN = 'cron/outreach-run'

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
        // Both mailboxes (law 33 (a)): an acquisition letter goes from lawal@, so its reply comes back there.
        // EACH MAILBOX AND EACH STEP BELOW IN ITS OWN GUARD (Lawal's 15:14 of 22 November 2026; the PM's 15:15, F1): one
        // mailbox's Graph error, one play's throw, never answers the run 500 and never stops the sender below; each fault
        // is named in the answer (faults) and in the phase record.
        const read: Record<string, unknown> = {}
        for (const mailbox of OUR_MAILBOXES) {
          read[mailbox] = await isolated(RUN, `the inbox of ${mailbox}`, async () => {
            const messages = await graphReadInbox({ ...graph, mailbox }, new Date(now.getTime() - INBOX_LOOKBACK_MS).toISOString())
            // THEIR ATTACHMENTS, KEPT AS CANDIDATE ASSETS (the master directive's A3 (1); src/lib/comms/emailed-media.ts):
            // read from this mailbox only for a message the intake takes, and stored through the photo page's own pipeline.
            const box = { ...graph, mailbox }
            const intake: InboxIntake = {
              files: async (graphId) => {
                const shown = await graphPhotosOf(box, graphId)
                return Promise.all(shown.map(async (a) => ({ name: a.name, contentType: a.contentType, bytes: await graphPhotoBytes(box, graphId, a.id) })))
              },
              media: mediaDeps('gallery'),
            }
            return handleInbox(db, messages, { mailbox, origin, actingUser, now, intake })
          })
        }
        inbox = read
      }
      // The learning loop judges each play's test once, before the plan, so the winner is drafted from the same run.
      judged = await isolated(RUN, 'judging the plays', () => judgePlays(db, now))
      plays = await isolated(RUN, 'planning the plays', () => planPlays(db, { now, origin, actingUser }))
      // EVERY PLAY DECISION, SAID WITH ITS REASON (the PM's 23:56 of 22 November 2026: one of Monday's ten letters was queued
      // and the run kept no record of why the others were not; the reasons lived only in this run's answer, which nothing
      // keeps). Each play's cap and use, and each contact queued, held, refused or not drafted with its reason, in the log.
      if (!isStepFault(plays)) for (const line of playDecisionLines(plays as PlayReport[])) console.log(`[cron/outreach-run] ${line}`)
      dms = await isolated(RUN, 'drafting the DMs', () => planDms(db, { now, origin, actingUser }))
      partners = await isolated(RUN, "the partners' messages", () => planRelationship(db, { now, origin, actingUser }))
    } else if (sender.data.mode === 'hold') {
      inbox = 'not read: the sender is on hold'
      plays = 'not planned: the sender is on hold'
      judged = 'not judged: the sender is on hold'
      dms = 'not drafted: the sender is on hold'
      partners = 'not drafted: the sender is on hold'
    }

    // LAWAL'S SENT ITEMS (Release 2, item 5): what he sent from the outreach mailbox, recorded on each organiser's
    // timeline (src/lib/outreach/sent-sync.ts). Reading only, so it runs while the sender is on hold too, once Graph can
    // read the mailbox; nothing sends. Read BEFORE the sender (the PM's 09:15 of 18 November 2026, item 2: one send path,
    // no doubles), so a draft he sent himself is recorded before the sender asks whether that contact was written. A
    // failure is reported and logged and never stops the run.
    let sentItems: unknown = 'not synced: no Graph credentials'
    if (graph) {
      try {
        const synced: Record<string, unknown> = {}
        for (const mailbox of OUR_MAILBOXES) {
          synced[mailbox] = await syncSentItems(db, { ...graph, mailbox }, { sinceIso: new Date(now.getTime() - INBOX_LOOKBACK_MS).toISOString() })
        }
        sentItems = synced
        console.log(`[cron/outreach-run] sent items: ${JSON.stringify(sentItems)}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/outreach-run] sent items not synced:', message)
        sentItems = { error: message }
      }
    }

    // NO DAILY PRESS (the PM's item 2 of 00:05:52, 21 November 2026; laws 23 and 38): a held first letter that clears
    // under Lawal's standing approval of its template, with its words passing and its page check recorded by a person,
    // queues itself into the next business window in its city (src/lib/outreach/self-queue.ts). A fault here is said in
    // the answer and never stops the sender below.
    // THE EXPIRY SWEEP FIRST (Lawal's 19:13 of 22 November 2026, section 11; sender.ts expireLapsedLetters): a held or
    // queued letter the event it names no longer makes true is voided with its reason before anything queues or sends; the
    // contact stays. Its own guard: a fault is contained and named in the answer's faults.
    const lapsed = await isolated(RUN, 'the expiry sweep of held and queued letters', () => expireLapsedLetters(db, now))
    if (!isStepFault(lapsed)) {
      for (const v of lapsed.voided) console.log(`[cron/outreach-run] expired: ${v}`)
      for (const u of lapsed.unread) console.log(`[cron/outreach-run] expiry not read: ${u}`)
    }
    let selfQueued: unknown
    try {
      const q = await queueApprovedHeldLetters(db, { now })
      selfQueued = q
      console.log(`[cron/outreach-run] self queue: ${q.queued.length} queued, ${q.waiting.length} waiting${q.note ? ` (${q.note})` : ''}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[cron/outreach-run] self queue failed:', message)
      selfQueued = { error: message }
    }
    // REPLIES GO BY THEMSELVES (Lawal's 07:02 and 07:03 of 25 November 2026; src/lib/outreach/self-queue.ts
    // queueApprovedReplies): an answer in an organiser's thread on a template his standing approval holds queues itself
    // here, before the sender below; a fault is contained and named in the answer's faults.
    const repliesQueued = await isolated(RUN, 'the replies that queue themselves', () => queueApprovedReplies(db, { now }))
    if (!isStepFault(repliesQueued)) {
      console.log(`[cron/outreach-run] replies: ${repliesQueued.queued.length} queued, ${repliesQueued.waiting.length} waiting${repliesQueued.note ? ` (${repliesQueued.note})` : ''}`)
    }

    const sent = await runOutreachSender(db, { now, origin, graph })
    console.log(`[cron/outreach-run] mode ${sent.mode}: ${sent.sent.length} sent, ${sent.failed.length} failed, ${sent.refused.length} refused, ${sent.outsideHours} outside hours, ${sent.tooSoon ?? 0} answers not yet 50 minutes old${sent.mailboxNotRecorded?.length ? `, mailbox not recorded: ${sent.mailboxNotRecorded.join('; ')}` : ''}`)

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
    let followUps: unknown = 'not drafted in this run: the first run of each hour drafts'
    if (now.getUTCMinutes() < 15) {
      try {
        // The segment A letters are stored every hour, versioned, so a play can name their exact version.
        const segmentA = await storeSegmentALetters(db)
        twenty = TWENTY_ADVICE_DRAFTING
          ? { segmentA, twenty: await draftTheTwenty(db, { now, origin }) }
          : { segmentA, twenty: 'not drafted: the advice letter is superseded by the communication standard of 17 November 2026; organisers with listed events are written to by the segment A play' }
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
      // The twenty's follow ups the same hour (src/lib/outreach/follow-ups.ts; the PM's 19:56 and 20:21 of 12 November
      // 2026): day 4 and day 10 letters drafted HELD in each first letter's thread, from rows only. Nothing is sent.
      try {
        followUps = { day4: await draftDay4FollowUps(db, { now, origin }), day10: await draftDay10FollowUps(db, { now, origin }) }
        console.log(`[cron/outreach-run] the follow ups: ${JSON.stringify(followUps)}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/outreach-run] the follow ups not drafted:', message)
        followUps = { error: message }
      }
    }
    // THE TWENTY'S POOL GROWS BY ITSELF (src/lib/outreach/basis-pool.ts; Lawal's 10:42 of 13 November 2026): once a night,
    // in the 23:30 turn in Melbourne, a few CRM organisers' own sites read politely and each published events address
    // recorded with its page and day; its no-messages check is the engine's own (engineCheck), read again at 23:45. It stops a
    // minute inside the function's 300 s from the run's start. Reading and
    // recording only; nothing sends. A failure is reported and logged and never stops the run above.
    let pool: unknown = 'not this turn: the pool grows in the 23:30 turn'
    const melbourne = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now)
    const hour = Number(melbourne.find((p) => p.type === 'hour')?.value)
    const minute = Number(melbourne.find((p) => p.type === 'minute')?.value)
    if (hour === POOL_HOUR && minute >= POOL_MINUTE_FROM && minute < POOL_MINUTE_FROM + 15) {
      try {
        const founder = await founderAccount(db)
        // While the coming week is short of its sixty first letters the night reads up to sixty organisers, else twelve
        // (the PM's 10:30 of 22 November 2026, item (b)); a failed count reads the short week's cap.
        const cap = poolCapFor(await weekFirstLetters(db, now).catch(() => 0))
        pool = founder.id === null ? `not read: ${founder.why}` : await runBasisPool(basisPoolStore(db, founder.id), fetch, now, now.getTime() + 240_000, { cap })
        console.log(`[cron/outreach-run] the pool: ${JSON.stringify(pool)}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[cron/outreach-run] the pool not read:', message)
        pool = { error: message }
      }
    }
    // THE ENGINE READS AGAIN THE ADDRESSES IT HAS NOT CLEARED (the PM's 15:48 of 22 November 2026, F5): the pool turn's
    // second run, 23:45 in Melbourne, re-reads each unticked contact's own page and ticks it by the engine's check, or
    // records why not on the contact; the run's own guard keeps a fault here from touching anything else.
    let recheck: unknown = 'not this turn: the engine re-reads unticked addresses in the 23:45 turn'
    if (hour === POOL_HOUR && minute >= POOL_MINUTE_FROM + 15 && minute < POOL_MINUTE_FROM + 30) {
      recheck = await isolated(RUN, 'the engine re-reading unticked addresses', () => recheckUnticked(engineRecheckStore(db), fetch, now, now.getTime() + 240_000))
      console.log(`[cron/outreach-run] the engine's re-read: ${JSON.stringify(recheck)}`)
    }
    // THE TIMETABLE'S OUTREACH PHASES, MEASURED (the daily timetable, locked 20 November 2026; src/lib/ops/phase-runs.ts):
    // the phase this quarter hour holds, the letters this run sent as its units.
    // Every step this run contained, by name: a mailbox's read, the plays, the DMs, the partners (F1), the engine's re-read (F5).
    const faults = [...(typeof inbox === 'object' && inbox !== null ? Object.values(inbox) : []), judged, plays, dms, partners, recheck, lapsed].filter(isStepFault)
    const outreachPhase = outreachPhaseAt(melbourneMinutes(now))
    if (outreachPhase) {
      const report = sent as { sent?: readonly unknown[]; failed?: readonly unknown[]; refused?: readonly unknown[]; note?: string }
      await recordPhaseRun(db, {
        phase: outreachPhase,
        ride: 'outreach',
        startedAt: now,
        endedAt: new Date(),
        units: report.sent?.length ?? 0,
        result: `${report.sent?.length ?? 0} sent, ${report.failed?.length ?? 0} failed, ${report.refused?.length ?? 0} refused${report.note ? `; ${report.note}` : ''}${faults.length ? `; contained: ${faults.map((f) => `${f.step}: ${f.error}`).join('; ')}` : ''}`.slice(0, 2000),
        failed: (report.failed?.length ?? 0) > 0 || faults.length > 0,
      })
    }
    // THE MISSED-RUN ALARM (Lawal's 09:01 of 20 November 2026, item 4; src/lib/ops/missed-runs.ts): this run already comes
    // every quarter hour, so it writes one alarm row for any phase with no run an hour past its cutoff, once a day each;
    // no new cron. A failed read or write is named in the answer and never stops the run above.
    const watchdog = await recordMissedRuns(db, now)
    if ('unread' in watchdog) console.error('[cron/outreach-run] the missed-run alarm could not run:', watchdog.unread)
    return NextResponse.json({ ok: true, faults, dns, inbox, judged, plays, dms, partners, selfQueued, repliesQueued, sent, acquisition, tasks, twenty, spotlight, followUps, recheck, sentItems, pool, watchdog })
  } catch (err) {
    console.error('[cron/outreach-run] failed:', err)
    return NextResponse.json({ error: 'outreach run failed' }, { status: 500 })
  }
}

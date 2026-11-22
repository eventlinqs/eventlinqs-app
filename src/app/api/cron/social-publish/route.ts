import { recordPhaseRun } from '@/lib/ops/phase-runs'
import { claimPublishLease, deploymentOf, HOURLY_FLAG, isHourRun, recordPublishRun, releasePublishLease } from '@/lib/social/publish-run'
import { socialPhaseAt } from '@/lib/ops/timetable'
import { planCheckWords } from '@/lib/ops/plan-check'
import { midnightIn } from '@/lib/dates/zone-midnight'
import { NextRequest, NextResponse } from 'next/server'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveUnderStandingPolicy, standingPolicyDryRun, heldPostsNeedingInvestigation, planCampaignWeek, postNightNow, publishDuePieces, readBackPendingPosts, recordMissingPostings, redrawOlderLook, scheduleApprovedPieces, expireLapsedSchedules } from '@/lib/social/store'
import { founderAccount } from '@/lib/outreach/twenty-drafts'
import { socialAnalyticsFromEnv, socialPostReaderFromEnv, socialPublishedSearchFromEnv, socialPublisherFromEnv } from '@/lib/social/meta-wiring'
import { reconcileHeld } from '@/lib/social/reconcile'
import { recordBlotatoFigures } from '@/lib/growth/social-report'
import { runSocialPlanEngine } from '@/lib/social/plan-engine'
import { getSiteUrl } from '@/lib/site-url'
import { switchOffByCode, switchTrips, type PolicyHour } from '@/lib/social/policy-guard'
import { PREFLIGHT_HOUR, runPreflight } from '@/lib/social/preflight'
import { planAsOf } from '@/lib/social/plan-for'

export const dynamic = 'force-dynamic'

/** The Melbourne hours whose run gives the standing policy's approvals: 05:40 first, so the timetable's schedule phase
 * has the day's posts approved and scheduled before 06:00 (law 35; the PM's 18:46 of 22 November 2026, fix 2: the 05:40
 * phase failed on 21 and 22 November reading nothing scheduled while the eligible posts waited for 06:40), then 06:40
 * for the live phase, then every three hours. */
const POLICY_HOURS: ReadonlySet<number> = new Set([5, 6, 9, 12, 15, 18])

/** The hour on Melbourne's clock, where the guide's cities keep their days. */
function melbourneHour(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', hour: '2-digit', hourCycle: 'h23' }).format(now))
}


/**
 * APPROVED PIECES SCHEDULE THEMSELVES (the release checklist B5; the project manager's 20:17 of 28 October 2026). At 40
 * past each hour: every piece whose newest version a person approved is given its moment on Instagram and Facebook by
 * the cadence; then every moment that has come is published, or, while the switch social_auto_publish is off (until
 * Meta approves the app), only said: nothing is written and nothing goes. The Meta publisher (car 58,
 * src/lib/social/meta-publisher.ts) is passed in once Lawal's script has written the five META_ names; until then, with
 * the switch on, a due piece is held with "no publisher is connected", never sent another way. Route B (Blotato, Lawal's yes of 15 November 2026) is used when our own app is not connected (meta-wiring.ts socialPublisherFromEnv).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  // THE STANDING POLICY AS A DRY RUN (the PM's 13:50 item 3): with ?policy=dry the run only answers, for every drafted
  // piece the policy may approve, whether it is eligible and why; it approves, schedules and publishes nothing.
  if (request.nextUrl.searchParams.get('policy') === 'dry') {
    const rows = await standingPolicyDryRun(createAdminClient(), { now: new Date(), siteOrigin: getSiteUrl() })
    return NextResponse.json({
      dryRun: true,
      eligible: rows?.filter((r) => r.eligible).length ?? 0,
      outside: rows?.filter((r) => !r.eligible).length ?? 0,
      pieces: rows ?? [],
    })
  }

  // THE INSTAGRAM READ BACK, ASKED (the PM's 19:48 of 19 November 2026: 'until then no Instagram post is called live by
  // anyone'): with ?readback=only the run only reads Blotato for every post still held by its reference, writes each
  // public URL Blotato gives (as the hourly run does), and answers every reference with Blotato's own status; it draws,
  // approves, schedules and publishes nothing. The answer names references and statuses, never a person.
  // THE PRE FLIGHT, ASKED (AV (c)): with ?preflight=1 the run puts every piece due today through its checks and answers
  // what it found; it writes nothing unless apply=1, when it rejects and holds each refused piece for the planner to
  // draw again and records the 08:00 report's line.
  if (request.nextUrl.searchParams.get('preflight') === '1') {
    const db = createAdminClient()
    const apply = request.nextUrl.searchParams.get('apply') === '1'
    const founder = apply ? await founderAccount(db) : { id: null }
    const p = await runPreflight(db, { now: new Date(), siteOrigin: getSiteUrl(), apply, by: founder.id })
    return NextResponse.json({ preflight: true, ...p })
  }

  // THE READ ONLY BLOTATO RECONCILE (src/lib/social/reconcile.ts; the PM's 09:55 item 2): every held row Blotato may have
  // accepted, matched against Blotato's own published posts; it writes nothing (.github/workflows/social-reconcile.yml).
  if (request.nextUrl.searchParams.get('reconcile') === 'read') {
    const search = socialPublishedSearchFromEnv()
    if (search === null) return NextResponse.json({ reconcile: true, read: false, why: 'no Blotato key in this environment' }, { status: 409 })
    const answers = await reconcileHeld(createAdminClient(), search)
    return NextResponse.json({ reconcile: true, read: true, rows: answers.length, answers })
  }

  if (request.nextUrl.searchParams.get('readback') === 'only') {
    const back = await readBackPendingPosts(createAdminClient(), socialPostReaderFromEnv())
    return NextResponse.json({ readBack: true, read: back.read, filled: back.filled, pending: back.pending })
  }

  // THE PLAN, ASKED ONCE (the PM's item 3 of 23:57, 20 November 2026: the day planned before six, law 35): with ?plan=now
  // the run plans the week and today's law 37 moments exactly as its own 06:40 run does (planCampaignWeek, planned by no
  // person) and answers what it drew; it approves, schedules and publishes nothing, and it adds no cron and quickens none:
  // it runs only when asked (.github/workflows/social-plan-now.yml).
  if (request.nextUrl.searchParams.get('plan') === 'now') {
    const db = createAdminClient()
    // ?for=tomorrow draws tomorrow's moments tonight, as of tomorrow's 05:00 (src/lib/social/plan-for.ts; the PM's 17:42).
    const asOf = planAsOf({ for: request.nextUrl.searchParams.get('for') }, new Date())
    const week = await planCampaignWeek(db, { plannedBy: null, now: asOf })
    if (week.created > 0) {
      await recordAnonAuditEvent({ action: 'system.social.plan', actorEmail: 'cron/social-publish?plan=now', metadata: { campaignId: week.campaignId, weekStart: week.weekStart, created: week.created, held: week.held } })
    }
    return NextResponse.json({ planned: true, asOf: asOf.toISOString(), campaignId: week.campaignId, weekStart: week.weekStart, created: week.created, existing: week.existing, held: week.held })
  }

  // POST ONE NIGHT NOW, FROM OUR SIDE (Lawal, 22 November 2026, 00:32: "her post goes to Facebook and Instagram now ... I
  // don't care about the time ... the schedule"; his 01:23: posting is done by the engine from our side through Blotato,
  // never through Lawal in the admin). With ?post=now&event=<id> the run draws that night's feed post on its permitted
  // photograph, approves it checked in the standing approval's name, gives it a slot at this minute (the posting hours
  // waived for that night by his word, nothing else), publishes it through the publisher and reads it back
  // (store.ts postNightNow). Started only by .github/workflows/social-post-now.yml; it adds no cron and quickens none.
  if (request.nextUrl.searchParams.get('post') === 'now') {
    const event = request.nextUrl.searchParams.get('event') ?? ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event)) return NextResponse.json({ posted: false, why: 'the event is not an id' }, { status: 400 })
    const db = createAdminClient()
    const now = new Date()
    const founder = await founderAccount(db)
    if (!founder.id) return NextResponse.json({ posted: false, why: "no founder account to approve in the standing approval's name" }, { status: 409 })
    const result = await postNightNow(db, { eventId: event, by: founder.id, now, siteOrigin: getSiteUrl(), publisher: socialPublisherFromEnv(db, now), reader: socialPostReaderFromEnv() })
    await recordAnonAuditEvent({
      action: 'system.social.post_now',
      actorEmail: 'cron/social-publish?post=now',
      metadata: { event, piece: result.pieceId, state: result.state, lines: result.lines.slice(0, 10), waived: "the posting hours, for this night, by Lawal's word of 22 November 2026, 00:32" },
    })
    return NextResponse.json({ posted: result.state === 'posted', piece: result.pieceId, lines: result.lines })
  }

  try {
    const db = createAdminClient()
    const now = new Date()
    /* ONE PUBLISHING RUN AT A TIME (src/lib/social/publish-run.ts; Lawal's hardening order of 22 November 2026, sections
       3 and 4): the run claims the one lease before it schedules or publishes; a repeated invocation, a retried cron or
       the watchdog finding it held does nothing and says so on its own row. A run that dies frees it by expiry. */
    const holder = `social-publish ${deploymentOf() ?? 'local'} ${now.toISOString()}`
    const lease = await claimPublishLease(db, holder)
    if (!lease.held) {
      await recordPublishRun(db, { route: '/api/cron/social-publish', startedAt: now, endedAt: new Date(), deployment: deploymentOf(), switchOn: false, drawn: 0, approved: 0, scheduled: 0, due: 0, published: 0, held: 0, failed: 0, ok: true, result: `skipped: ${lease.why}` })
      return NextResponse.json({ ok: true, skipped: lease.why })
    }
    const hourRun = isHourRun(now)
    /* THE REVERSAL (the PM's 17:20): if the watchdog has found two publishing runs overlapping, or a piece with two
       posting rows on one network, it turns social_publish_hourly on (src/lib/social/publish-run.ts), and every run
       but the hour's own does nothing and says so, as the hourly cron did, until a person turns it off. */
    if (!hourRun) {
      const { data: hourly } = await db.from('feature_flags').select('enabled').eq('flag', HOURLY_FLAG).maybeSingle()
      if (hourly?.enabled === true) {
        await recordPublishRun(db, { route: '/api/cron/social-publish', startedAt: now, endedAt: new Date(), deployment: deploymentOf(), switchOn: false, drawn: 0, approved: 0, scheduled: 0, due: 0, published: 0, held: 0, failed: 0, ok: true, result: `skipped: ${HOURLY_FLAG} is on (the watchdog's reversal), so only the hour's own run publishes` })
        await releasePublishLease(db, holder)
        return NextResponse.json({ ok: true, skipped: `${HOURLY_FLAG} is on` })
      }
    }
    /* THE PRE FLIGHT (AV (c), the PM's 16:30 of 21 November 2026): at the 04:40 run, before 05:00 and before the 06:40
       run, every piece due today meets its checks; a refused one is rejected and held so the planner draws the next best
       moment, and the line goes to the 08:00 report. A failed pre-flight is said and never stops the run. */
    if (hourRun && melbourneHour(now) === PREFLIGHT_HOUR) {
      try {
        const founder = await founderAccount(db)
        const p = await runPreflight(db, { now, siteOrigin: getSiteUrl(), apply: founder.id !== null, by: founder.id })
        console.log(`[cron/social-publish] pre-flight: ${p.line}${p.applied ? '' : ' (not applied: no founder account to act for)'}`)
        for (const r of p.redrawn) console.log(`[cron/social-publish] pre-flight redraws: ${r}`)
        if (p.nothingCanPost) console.log(`[cron/social-publish] pre-flight: nothing can post today: ${p.nothingCanPost}`)
      } catch (error) {
        console.error('[cron/social-publish] the pre-flight could not run:', error instanceof Error ? error.message : error)
      }
    }
    /* THE WEEK DRAWN AGAIN IN THE LOCKED LOOK (the PM's 09:35 of 16 November 2026): a draft the lock refuses is drawn
       again by the planner before anything is scheduled, so a week planned by older code reaches the switch-on in the
       look it can be approved in. Never an approved piece. A failed redraw never holds the publishing below. */
    let redrawn: { redrawn: readonly string[]; kept: readonly string[] } = { redrawn: [], kept: [] }
    if (hourRun) try {
      redrawn = await redrawOlderLook(db, now)
      if (redrawn.redrawn.length > 0 || redrawn.kept.length > 0) console.log(`[cron/social-publish] drawn again in the locked look: ${redrawn.redrawn.length}; kept as they are: ${redrawn.kept.length}`)
      for (const k of redrawn.kept) console.log(`[cron/social-publish] kept: ${k}`)
    } catch (error) {
      console.error('[cron/social-publish] the week could not be drawn again:', error instanceof Error ? error.message : error)
    }
    /* THE STANDING PUBLISHING POLICY (law 31, Lawal's 12:03 of 19 November 2026): while the switch is on, every drafted
       piece of the week in an approved family is given the checked approval in the founder's name (store.ts
       approveUnderStandingPolicy), so in-policy posts publish by themselves in the cadence bands. Six runs a day, 05:40
       first so the day is prepared before 06:00 (law 35), because each check reads the night's booking link. A failure is said
       and never stops the publishing below.
       IT FAILS CLOSED (the PM's 10:47 of 20 November 2026, item 1; src/lib/social/policy-guard.ts): the dry run first,
       every piece logged eligible or not; the policy approves only what it read eligible; and any approval outside it,
       any failed check of an approved piece, or any publish error turns the switch off by code with an alarm row. */
    let policyHour: PolicyHour | null = null
    const policyFaults: string[] = []
    if (hourRun && POLICY_HOURS.has(melbourneHour(now))) {
      try {
        const { data: flag } = await db.from('feature_flags').select('enabled').eq('flag', 'social_auto_publish').maybeSingle()
        if (flag?.enabled === true) {
          const founder = await founderAccount(db)
          if (founder.id === null) {
            console.error(`[cron/social-publish] the standing policy approved nothing: ${founder.why}`)
            policyFaults.push(`the standing policy approved nothing: ${founder.why}`)
          } else {
            const dry = (await standingPolicyDryRun(db, { now, siteOrigin: getSiteUrl() })) ?? []
            const eligible = new Set(dry.filter((r) => r.eligible).map((r) => r.id))
            for (const r of dry) console.log(`[cron/social-publish] dry run: ${r.eligible ? 'ELIGIBLE' : 'outside'} ${r.label} (${r.id})${r.eligible ? '' : `: ${r.reasons.join(' ')}`}`)
            await recordAnonAuditEvent({
              action: 'system.social.standing_policy_dry_run',
              actorEmail: 'cron/social-publish',
              metadata: { eligible: [...eligible], outside: dry.filter((r) => !r.eligible).map((r) => ({ id: r.id, reasons: r.reasons })) },
            })
            const policy = await approveUnderStandingPolicy(db, { by: founder.id, now, siteOrigin: getSiteUrl(), only: eligible })
            policyHour = { eligible, approved: policy?.approved ?? [], refused: (policy?.held ?? []).map((h) => ({ id: h.id, reason: h.reason })) }
            if (policy && (policy.approved.length > 0 || policy.held.length > 0)) {
              console.log(`[cron/social-publish] standing policy: ${policy.approved.length} approved, ${policy.held.length} outside the policy`)
              for (const h of policy.held) console.log(`[cron/social-publish] outside the policy: ${h.label}: ${h.reason}`)
              await recordAnonAuditEvent({
                action: 'system.social.standing_policy_approval',
                actorEmail: 'cron/social-publish',
                metadata: { approved: policy.approved, held: policy.held.map((h) => ({ id: h.id, reason: h.reason })) },
              })
            }
          }
        }
      } catch (error) {
        console.error('[cron/social-publish] the standing policy could not approve:', error instanceof Error ? error.message : error)
        policyFaults.push(`the standing policy could not run: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    // EXPIRY AT ONCE, EVERY RUN (timing.ts; Lawal's 19:13 of 22 November 2026, sections 4 and 5): a scheduled piece whose
    // event was cancelled, postponed, finished or sold out, or whose latest acceptable time has passed, is expired with
    // its reason before anything is scheduled or published. Its own guard: a failure is said and never stops the run.
    try {
      const lapsed = await expireLapsedSchedules(db, now)
      for (const x of lapsed.expired) console.log(`[cron/social-publish] expired: ${x}`)
      for (const u of lapsed.unread) console.log(`[cron/social-publish] expiry not read: ${u}`)
    } catch (error) {
      console.error('[cron/social-publish] the expiry sweep could not run:', error instanceof Error ? error.message : error)
    }
    // THE SOCIAL SUB ENGINE (plan-engine.ts; Lawal's 19:39 of 22 November 2026): the event changes outbox from its own
    // position, and the events it has not planned yet, each decided and planned by its own criteria. Its own guard.
    try {
      const plans = await runSocialPlanEngine(db, now)
      console.log(`[cron/social-publish] social plans: ${plans.planned} written, outbox position ${plans.position}${plans.faults.length ? `; ${plans.faults.join(' | ')}` : ''}`)
    } catch (error) {
      console.error('[cron/social-publish] the social plan engine could not run:', error instanceof Error ? error.message : error)
    }
    // A SCHEDULING FAULT NEVER STOPS PUBLISHING (the inventory of 19:3x, rule 49: a throw here ended the whole run with
    // nothing published; Lawal's 15:13: no single failure disables an entire business operation). It is said and held.
    let scheduled: Awaited<ReturnType<typeof scheduleApprovedPieces>>
    try {
      scheduled = await scheduleApprovedPieces(db, now)
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error)
      console.error('[cron/social-publish] scheduling could not run; publishing goes on:', why)
      scheduled = { scheduled: [], held: [`scheduling could not run: ${why}`], floor: [] }
    }
    const published = await publishDuePieces(db, now, { siteOrigin: getSiteUrl(), publisher: socialPublisherFromEnv(db, now), reader: socialPostReaderFromEnv() })
    for (const w of published.waiting) console.log(`[cron/social-publish] waiting: ${w}`)
    // A SAFE CORRECTION IS RECORDED (Lawal's correction, 19:04 of 22 November 2026, section 1): each place line given its
    // night's own venue before posting, in the log and the audit trail.
    if ((published.corrected ?? []).length > 0) {
      for (const c of published.corrected ?? []) console.log(`[cron/social-publish] corrected before posting: ${c}`)
      try {
        await recordAnonAuditEvent({ action: 'system.social.fact_corrected', actorEmail: 'cron/social-publish', metadata: { corrected: published.corrected } })
      } catch (error) {
        console.error('[cron/social-publish] the correction could not be recorded in the audit trail:', error instanceof Error ? error.message : error)
      }
    }
    // THE SWITCH GOES OFF BY CODE only on a breach of the standing policy (policy-guard.ts switchTrips), with its alarm
    // row; a held, refused or failed piece is held alone and the run goes on (Lawal's hardening order, section 2 A). A
    // policy that could not run approved nothing; it is said and recorded, never a global stop.
    for (const f of policyFaults) console.error(`[cron/social-publish] ${f}`)
    if (published.switchOn) {
      const trips = switchTrips({ policy: policyHour, scheduleHeld: scheduled.held, publishHeld: published.held })
      if (trips.length > 0) await switchOffByCode(db, { now, phase: socialPhaseAt(melbourneHour(now)) ?? 'schedule', trips })
    }
    console.log(
      `[cron/social-publish] ${scheduled.scheduled.length} piece(s) scheduled; ${published.due} due; switch ${published.switchOn ? 'ON' : 'OFF'}: ` +
        (published.switchOn ? `${published.published.length} published, ${published.held.length} held` : `${published.wouldPublish.length} would go, nothing written`),
    )
    for (const h of [...scheduled.held, ...published.held]) console.log(`[cron/social-publish] held: ${h}`)
    // The operating model's A1: a day with nothing to post is named, never faked (the 08:00 report reads these).
    for (const f of scheduled.floor) console.log(`[cron/social-publish] floor: ${f}`)
    // Every post Blotato accepted is read back until its public URL is known; a failed read never stops the run.
    try {
      const back = await readBackPendingPosts(db, socialPostReaderFromEnv())
      for (const f of back.filled) console.log(`[cron/social-publish] URL read back: ${f}`)
      // Every post that went public with no posting is recorded (AV (a)); a failure is said and never stops the run.
      const missing = await recordMissingPostings(db)
      for (const m of missing.recorded) console.log(`[cron/social-publish] posting recorded: ${m}`)
      for (const m of missing.notRecorded) console.log(`[cron/social-publish] posting not recorded: ${m}`)
      for (const p of back.pending) console.log(`[cron/social-publish] URL not yet: ${p}`)
      const held = await heldPostsNeedingInvestigation(db)
      for (const h of held) console.log(`[cron/social-publish] ${h}`)
    } catch (error) {
      console.error('[cron/social-publish] the posts waiting for their URL could not be read back:', error instanceof Error ? error.message : error)
    }

    /* CAR C, MEASURE (the PM's 21:00 and 23:09 of 18 November 2026): once a day, the first run on or after 06:40 in
       Melbourne, the platforms' own figures for every post that went, read from Blotato and kept by the report's one
       writer. A failure here is said and never stops the run (law 23). */
    try {
      const analytics = socialAnalyticsFromEnv()
      if (analytics) {
        const read = await recordBlotatoFigures(db, analytics, now)
        if (read.state === 'read') {
          console.log(`[cron/social-publish] figures read: ${read.written} kept for ${read.matched.length} post(s); ${read.unmatched.length} not matched`)
          for (const x of read.matched) console.log(`[cron/social-publish] measured: ${x.pieceId} on ${x.platform} by its ${x.how}: ${x.postUrl ?? 'no address'}`)
          for (const u of read.unmatched) console.log(`[cron/social-publish] not matched, never guessed: ${u.id} on ${u.platform} (${u.postUrl ?? 'no address'}): ${u.why}`)
        }
      }
    } catch (error) {
      console.error('[cron/social-publish] the figures could not be read:', error instanceof Error ? error.message : error)
    }
    /* The release checklist F5: a publish by the machine is audited as a person's press is, one row per run that
       published or held anything; a run that only says what would go writes nothing. */
    if (published.published.length > 0 || published.held.length > 0) {
      await recordAnonAuditEvent({
        action: 'system.social.publish',
        actorEmail: 'cron/social-publish',
        metadata: { due: published.due, published: published.published, held: published.held },
      })
    }
    /* THE DAILY PICKS (car 58; plan.json's daily quota of one post per open city): once a day, in the 06:40 run, the
       week's campaign is planned as "Plan this week" plans it, so each day's posters wait in /admin/social for Lawal's
       approval. Planned by no person (planned_by null); nothing is approved or published here; a second plan keeps every
       piece once. After the publishing above, so a slow or failed plan never holds a post back. */
    let planned: { created: number; existing: number; held: number } | null = null
    // Also in the run that drew the week again, so a piece the new drawing adds (a venue spotlight) is there that hour.
    if (hourRun && (melbourneHour(now) === 6 || redrawn.redrawn.length > 0)) {
      try {
        const week = await planCampaignWeek(db, { plannedBy: null, now })
        planned = { created: week.created, existing: week.existing, held: week.held.length }
        console.log(`[cron/social-publish] the week planned: ${week.created} new piece(s), ${week.existing} kept, ${week.held.length} held`)
        for (const h of week.held) console.log(`[cron/social-publish] plan held: ${h}`)
        if (week.created > 0) {
          await recordAnonAuditEvent({ action: 'system.social.plan', actorEmail: 'cron/social-publish', metadata: { campaignId: week.campaignId, weekStart: week.weekStart, created: week.created, held: week.held } })
        }
      } catch (error) {
        console.error('[cron/social-publish] the week could not be planned:', error instanceof Error ? error.message : error)
      }
    }
    // THE TIMETABLE'S SOCIAL PHASES, MEASURED (the daily timetable, locked 20 November 2026; src/lib/ops/phase-runs.ts):
    // the phase this hour holds, its pieces scheduled and published as its units.
    const phase = hourRun ? socialPhaseAt(melbourneHour(now)) : null
    if (phase) {
      // THE DAILY PLAN CHECK (Lawal's 09:01 of 20 November 2026, item 3; src/lib/ops/plan-check.ts): at the schedule and live
      // phases, the policy's own dry run and what is scheduled for the rest of the day, on the phase row itself. A read that
      // fails is said on the row and fails the phase, never a calm one.
      let plan: { readonly words: string; readonly failed: boolean } | null = null
      if (phase === 'schedule' || phase === 'live') {
        try {
          const dry = await standingPolicyDryRun(db, { now, siteOrigin: getSiteUrl() })
          // The end of Melbourne's today, as the 08:00 report reads it (src/lib/admin/morning-report.ts windowsAt).
          const tomorrow = midnightIn(new Date(midnightIn(now, 'Australia/Melbourne').getTime() + 36 * 3_600_000), 'Australia/Melbourne')
          const later = await db.from('social_piece_schedules').select('id', { count: 'exact', head: true }).eq('state', 'scheduled').gte('go_at', now.toISOString()).lt('go_at', tomorrow.toISOString())
          if (later.error) throw new Error(`the rest of the day's schedule could not be read: ${later.error.message}`)
          plan = planCheckWords(dry, later.count ?? 0)
        } catch (fault) {
          plan = { words: `plan: the check could not run: ${fault instanceof Error ? fault.message : String(fault)}`, failed: true }
        }
      }
      await recordPhaseRun(db, {
        phase,
        ride: 'social',
        startedAt: now,
        endedAt: new Date(),
        // The pieces it drew again count as its work too (the PM's 04:51 of 20 November 2026: the 04:40 freeze drew six again
        // and read 0 units, so its time per unit measured nothing).
        units: scheduled.scheduled.length + published.published.length + redrawn.redrawn.length,
        result: `${scheduled.scheduled.length} scheduled; ${published.due} due; ${published.switchOn ? `${published.published.length} published, ${published.held.length} held` : 'the switch is off, nothing published'}; ${redrawn.redrawn.length} drawn again${plan ? `; ${plan.words}` : ''}`,
        failed: published.held.length > 0 || plan?.failed === true,
      })
    }
    /* EVERY RUN WRITES ITS OWN ROW (src/lib/social/publish-run.ts; Lawal's hardening order, section 2 E): an HTTP 200 is
       not proof; this row, with its deployment and its counts, is. Then the lease is freed for the next run. */
    const failedHere = policyFaults.length
    await recordPublishRun(db, {
      route: '/api/cron/social-publish',
      startedAt: now,
      endedAt: new Date(),
      deployment: deploymentOf(),
      switchOn: published.switchOn,
      drawn: redrawn.redrawn.length + (planned?.created ?? 0),
      approved: policyHour?.approved.length ?? 0,
      scheduled: scheduled.scheduled.length,
      due: published.due,
      published: published.published.length,
      held: scheduled.held.length + published.held.length,
      failed: failedHere,
      ok: failedHere === 0,
      result: `${scheduled.scheduled.length} scheduled; ${published.due} due; ${published.switchOn ? `${published.published.length} published, ${published.held.length} held` : 'the switch is off, nothing published'}; ${redrawn.redrawn.length} drawn again${policyFaults.length > 0 ? `; ${policyFaults.join(' | ')}` : ''}`,
    })
    await releasePublishLease(db, holder)
    return NextResponse.json({ ok: true, redrawn, scheduled, published, planned })
  } catch (err) {
    console.error('[cron/social-publish] failed:', err)
    return NextResponse.json({ error: 'social publish failed' }, { status: 500 })
  }
}

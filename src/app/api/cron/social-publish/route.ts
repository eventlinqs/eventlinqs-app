import { NextRequest, NextResponse } from 'next/server'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { findHeldPostsOnBlotato, planCampaignWeek, publishDuePieces, readBackPendingPosts, redrawOlderLook, scheduleApprovedPieces } from '@/lib/social/store'
import { socialAnalyticsFromEnv, socialPostReaderFromEnv, socialPublishedSearchFromEnv, socialPublisherFromEnv } from '@/lib/social/meta-wiring'
import { recordBlotatoFigures } from '@/lib/growth/social-report'
import { getSiteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

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

  try {
    const db = createAdminClient()
    const now = new Date()
    /* THE WEEK DRAWN AGAIN IN THE LOCKED LOOK (the PM's 09:35 of 16 November 2026): a draft the lock refuses is drawn
       again by the planner before anything is scheduled, so a week planned by older code reaches the switch-on in the
       look it can be approved in. Never an approved piece. A failed redraw never holds the publishing below. */
    let redrawn: { redrawn: readonly string[]; kept: readonly string[] } = { redrawn: [], kept: [] }
    try {
      redrawn = await redrawOlderLook(db, now)
      if (redrawn.redrawn.length > 0 || redrawn.kept.length > 0) console.log(`[cron/social-publish] drawn again in the locked look: ${redrawn.redrawn.length}; kept as they are: ${redrawn.kept.length}`)
      for (const k of redrawn.kept) console.log(`[cron/social-publish] kept: ${k}`)
    } catch (error) {
      console.error('[cron/social-publish] the week could not be drawn again:', error instanceof Error ? error.message : error)
    }
    const scheduled = await scheduleApprovedPieces(db, now)
    const published = await publishDuePieces(db, now, { siteOrigin: getSiteUrl(), publisher: socialPublisherFromEnv(db, now) })
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
      for (const p of back.pending) console.log(`[cron/social-publish] URL not yet: ${p}`)
      const held = await findHeldPostsOnBlotato(db, socialPublishedSearchFromEnv())
      for (const f of held.found) console.log(`[cron/social-publish] held but published, found on Blotato: ${f}`)
      for (const m of held.missing) console.log(`[cron/social-publish] held, not found on Blotato: ${m}`)
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
    if (melbourneHour(now) === 6 || redrawn.redrawn.length > 0) {
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
    return NextResponse.json({ ok: true, redrawn, scheduled, published, planned })
  } catch (err) {
    console.error('[cron/social-publish] failed:', err)
    return NextResponse.json({ error: 'social publish failed' }, { status: 500 })
  }
}

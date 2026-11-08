import { NextRequest, NextResponse } from 'next/server'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { planCampaignWeek, publishDuePieces, scheduleApprovedPieces } from '@/lib/social/store'
import { metaPublisherFromEnv } from '@/lib/social/meta-wiring'
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
 * the switch on, a due piece is held with "no Meta publisher is connected", never sent another way.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const db = createAdminClient()
    const now = new Date()
    const scheduled = await scheduleApprovedPieces(db, now)
    const published = await publishDuePieces(db, now, { siteOrigin: getSiteUrl(), publisher: metaPublisherFromEnv(db, now) })
    console.log(
      `[cron/social-publish] ${scheduled.scheduled.length} piece(s) scheduled; ${published.due} due; switch ${published.switchOn ? 'ON' : 'OFF'}: ` +
        (published.switchOn ? `${published.published.length} published, ${published.held.length} held` : `${published.wouldPublish.length} would go, nothing written`),
    )
    for (const h of [...scheduled.held, ...published.held]) console.log(`[cron/social-publish] held: ${h}`)
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
    if (melbourneHour(now) === 6) {
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
    return NextResponse.json({ ok: true, scheduled, published, planned })
  } catch (err) {
    console.error('[cron/social-publish] failed:', err)
    return NextResponse.json({ error: 'social publish failed' }, { status: 500 })
  }
}

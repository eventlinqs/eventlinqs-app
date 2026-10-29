import { NextRequest, NextResponse } from 'next/server'
import { recordAnonAuditEvent } from '@/lib/admin/audit'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishDuePieces, scheduleApprovedPieces } from '@/lib/social/store'
import { getSiteUrl } from '@/lib/site-url'

export const dynamic = 'force-dynamic'

/**
 * APPROVED PIECES SCHEDULE THEMSELVES (the release checklist B5; the project manager's 20:17 of 28 October 2026). At 40
 * past each hour: every piece whose newest version a person approved is given its moment on Instagram and Facebook by
 * the cadence; then every moment that has come is published, or, while the switch social_auto_publish is off (until
 * Meta approves the app), only said: nothing is written and nothing goes. No Meta publisher is connected yet, so with
 * the switch on a due piece is held with that reason, never sent another way.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  try {
    const db = createAdminClient()
    const now = new Date()
    const scheduled = await scheduleApprovedPieces(db, now)
    const published = await publishDuePieces(db, now, { siteOrigin: getSiteUrl(), publisher: null })
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
    return NextResponse.json({ ok: true, scheduled, published })
  } catch (err) {
    console.error('[cron/social-publish] failed:', err)
    return NextResponse.json({ error: 'social publish failed' }, { status: 500 })
  }
}

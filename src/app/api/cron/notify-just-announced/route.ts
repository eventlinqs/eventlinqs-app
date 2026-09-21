import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { dispatchAlert } from '@/lib/notifications/dispatch'
import { ReadFailed } from '@/lib/supabase/read-or-throw'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import {
  findUnreachableUsers,
  readAlreadyAlerted,
  readConfirmedLineups,
  readFollowersByArtist,
  readFollowersByOrganisation,
  readOrganisationNames,
} from '@/lib/notifications/audience'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Bound the work a single run will do, so a backlog never runs away.
const MAX_EVENTS = 200
const MAX_DISPATCHES = 1000

/**
 * Just-Announced alert cron (demand engine 3, the biggest lever).
 *
 * For every recently published, public, upcoming event, alert the people who
 * follow that organiser (saved_organisers) once. The notifications table's
 * unique (user, event, type) makes this idempotent, so this runs on a simple
 * schedule without tracking a high-water mark and never double-sends. Push is
 * the primary channel; email is the fallback. Protected by CRON_SECRET.
 *
 * THE HEADER USED TO STOP AT THAT SENTENCE, and the claim it made was true of
 * the dedupe and false of the run. Until 21 September 2026 this route read its
 * follower lists with no bound, so a Supabase project's row ceiling silently
 * removed every follower past the first thousand; and it counted its dispatch
 * budget against every recipient it LOOKED at, so once the work in the fourteen
 * day window passed the cap, each run spent the whole budget re-confirming
 * alerts it had already delivered and stopped at the same place. Not a delay: a
 * livelock, which a newly announced event made worse rather than better, because
 * events are read newest first and a new one lands at the front.
 *
 * Both are closed in src/lib/notifications/audience.ts, which is where the
 * measurements and the citations live. The invariant this route now holds, and
 * which tests/unit/cron/notify-just-announced.test.ts pins from eight
 * directions, is: EVERY FOLLOWER IS EVENTUALLY ALERTED, however many there are,
 * however the cap falls, and whoever is sitting in front of them.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const admin = createAdminClient()
  const baseUrl = getSiteUrl().replace(/\/$/, '')
  const now = new Date()
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

  try {
    const { data: events, error } = await admin
      .from('events')
      .select('id, title, slug, organisation_id, venue_city, start_date, created_at')
      .eq('status', 'published')
      .eq('visibility', 'public')
      .gte('start_date', now.toISOString())
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(MAX_EVENTS)

    if (error) {
      console.error('[cron/notify-just-announced] event query failed:', error)
      return NextResponse.json({ error: 'query failed' }, { status: 500 })
    }
    if (!events || events.length === 0) {
      return NextResponse.json({ ok: true, events: 0, sent: 0 })
    }

    const orgIds = [...new Set(events.map((e) => e.organisation_id).filter(Boolean))] as string[]
    const eventIds = events.map((e) => e.id)

    // Every read below is PAGED and its `.in()` list is CHUNKED. See
    // src/lib/notifications/audience.ts for the three defects that cost.
    const orgName = await readOrganisationNames(admin, orgIds)
    const followersByOrg = await readFollowersByOrganisation(admin, orgIds)

    // Broadcast Stage 3 (SPEC 4.5): when the stage is on, an artist's followers
    // hear about every show they are confirmed on. Same dedupe key (user, event,
    // just_announced), so an organiser-follower who also follows the artist is
    // never alerted twice for one event.
    const artistFollowersByEvent = new Map<string, string[]>()
    if (await isFeatureEnabled('broadcast_artists')) {
      const lineups = await readConfirmedLineups(admin, eventIds)
      const artistIds = [...new Set(lineups.map((l) => l.artist_id))]
      const followersByArtist = await readFollowersByArtist(admin, artistIds)
      for (const row of lineups) {
        const followers = followersByArtist.get(row.artist_id) ?? []
        if (followers.length === 0) continue
        const list = artistFollowersByEvent.get(row.event_id) ?? []
        list.push(...followers)
        artistFollowersByEvent.set(row.event_id, list)
      }
    }

    let sent = 0
    let dispatches = 0
    // Held for a recipient's quiet hours. Counted and reported, because a run
    // that deferred four hundred alerts and a run that had nothing to do must
    // never read the same from the outside.
    let deferred = 0
    // Recipients this run did not have to consider at all: already alerted, or
    // with every channel switched off. Reported because the difference between
    // "nothing to do" and "everything already done" is the whole subject here.
    let settled = 0
    /*
     * RECIPIENTS DEFERRED BY A READ THAT COULD NOT BE MADE, counted separately
     * from the quiet-hours deferral and reported for the same reason: a run that
     * held four hundred alerts because the database was blinking and a run that
     * held them because it was midnight must never read the same from outside.
     *
     * The catch is per RECIPIENT and it is the whole mechanism. `dispatchAlert`
     * raises rather than deciding when a read fails (see its header), and
     * without this the first flaky read would abandon every recipient and every
     * event left in the pass. One person is deferred; the run finishes.
     */
    let blinked = 0

    outer: for (const event of events) {
      if (!event.organisation_id) continue
      const followers = followersByOrg.get(event.organisation_id) ?? []
      const artistFollowers = artistFollowersByEvent.get(event.id) ?? []
      const audience = [...new Set([...followers, ...artistFollowers])]
      if (audience.length === 0) continue

      /*
       * THE BUDGET IS SPENT ON WORK, NOT ON LOOKING AT WORK ALREADY DONE.
       *
       * `dispatches` used to be incremented before dispatchAlert, so an alert
       * skipped as a duplicate cost exactly what a send cost. Events are read
       * newest first, so every run walked the same sequence, spent the whole cap
       * re-confirming delivered alerts and broke at the same index: the tail was
       * never reached on any run, and a newly announced event pushed it further
       * away rather than nearer.
       *
       * Both classes of settled recipient are removed BEFORE the budget is
       * touched. Neither set is written anywhere and both are recomputed each
       * run, so a user who switches a channel back on is reachable again on the
       * next one.
       */
      const alerted = await readAlreadyAlerted(admin, event.id, 'just_announced')
      const outstanding = audience.filter((userId) => !alerted.has(userId))
      const unreachable = await findUnreachableUsers(admin, outstanding)
      const recipients = outstanding.filter((userId) => !unreachable.has(userId))
      settled += audience.length - recipients.length

      for (const userId of recipients) {
        if (dispatches >= MAX_DISPATCHES) break outer
        dispatches += 1
        try {
          const result = await dispatchAlert({
            admin,
            userId,
            eventId: event.id,
            type: 'just_announced',
            // ONE clock for the whole pass, so a long run cannot judge the first
            // follower against 9:59 pm and the last against 10:01 pm.
            now,
            ctx: {
              eventTitle: event.title,
              eventCity: event.venue_city,
              organiserName: orgName.get(event.organisation_id) ?? null,
              url: `${baseUrl}/events/${event.slug}`,
            },
          })
          if (result.status === 'sent') sent += 1
          if (result.status === 'skipped' && result.reason === 'quiet_hours') deferred += 1
        } catch (err) {
          // Only a read that could not be made is a deferral. Anything else is a
          // fault in this route and still takes the run down, loudly, which is
          // what a 500 on a cron is for.
          if (!(err instanceof ReadFailed)) throw err
          blinked += 1
          console.warn('[cron/notify-just-announced] deferred a recipient; a read could not be made', {
            event_id: event.id,
            user_id: userId,
          })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      events: events.length,
      organisations: orgIds.length,
      dispatches,
      sent,
      deferred,
      blinked,
      settled,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error('[cron/notify-just-announced] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

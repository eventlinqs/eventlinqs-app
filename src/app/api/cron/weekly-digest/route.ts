import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron/auth'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { sendEmail } from '@/lib/email/send'
import { oneClickUnsubscribeHeaders } from '@/lib/consent/one-click'
import { getSiteUrl } from '@/lib/site-url'
import {
  buildDigestEmailHtml,
  fetchDigestCities,
  fetchDigestEvents,
  fetchDigestRecipients,
  editionDigestCities,
  resolveDigestPeriod,
  type DigestEdition,
} from '@/lib/broadcast/digest'
import { DIGEST_MAX_RECIPIENTS_PER_RUN, planDigestRun } from '@/lib/broadcast/digest-run'
import { buildWhatsOn } from '@/lib/newsletter/whats-on'
import { readWhatsOnEdition } from '@/lib/newsletter/edition'
import { filterPermittedRecipients } from '@/lib/consent/resolver'
import { LOCAL_DIGEST_PURPOSE } from '@/lib/consent/purposes'
import { sendMoment } from '@/lib/newsletter/send-time'
import { NEWSLETTER_DESIGN_A_LIVE } from '@/lib/newsletter/design-a-live'
import { subscriberLetter } from '@/lib/newsletter/subscriber-letter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The weekly local digest cron (SPEC 3.2), now law 45 (a)'s two editions: THE
 * WEEK from 07:00 on Wednesday and THE WEEKEND from 07:00 on Friday, Melbourne
 * time (src/lib/newsletter/send-time.ts; vercel.json fires it from 20:00 to
 * 23:00 UTC on Tuesday and Thursday). CRON_SECRET-guarded (fail closed),
 * flag-gated on broadcast_digest, and idempotent per city per edition per
 * period through the digest_sends unique key, claimed before the first email,
 * so a re-run or a duplicate firing can never double send.
 *
 * Operator params (all CRON_SECRET-gated):
 *   ?city=slug        limit the run to one city
 *   ?dry_run=1        resolve recipients and events, send nothing, write
 *                     nothing: the evidence-gate probe
 *   ?test_to=email    send one real digest for ?city to this address only,
 *                     without writing digest_sends (a rehearsal send)
 *   ?preview_to=email render exactly what that address would receive and
 *                     return it, sending nothing and writing nothing. This
 *                     exists so a human READS the mail before it goes to real
 *                     people: tests prove the code path, only reading proves
 *                     the copy.
 */

/**
 * THE WEEK A SEND BELONGS TO, for the idempotence lookup only.
 *
 * `resolveDigestPeriod` anchors the period on the day it is called, so a row
 * written by Wednesday's cron carries `period_start` = Wednesday. The
 * pre-check matched on that exact date, which meant a SECOND invocation on any
 * other day found no row, called itself a new period, and sent the whole city
 * a second time. The header documents `?city=` re-runs as an operator path, so
 * that was reachable by design rather than only by a cron misfire.
 *
 * The lookup therefore asks for the most recent row within the last seven days
 * rather than for today's, and a resumed run keeps the ORIGINAL row's period so
 * the people it still owes receive the same week's email as the first batch
 * did, not a different one.
 */
const IDEMPOTENCE_WINDOW_DAYS = 7

function earliestPeriodStillThisWeek(now: Date): string {
  const earliest = new Date(now.getTime() - (IDEMPOTENCE_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000)
  return earliest.toISOString().slice(0, 10)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(request)
  if (denied) return denied

  if (!(await isFeatureEnabled('broadcast_digest'))) {
    return NextResponse.json({ ok: true, skipped: 'flag_off' })
  }

  const admin = createAdminClient()
  const origin = getSiteUrl()
  const now = new Date()
  const onlyCity = request.nextUrl.searchParams.get('city')
  const dryRun = request.nextUrl.searchParams.get('dry_run') === '1'
  const testTo = request.nextUrl.searchParams.get('test_to')
  const previewTo = request.nextUrl.searchParams.get('preview_to')
  // A dry run, a preview and a rehearsal reach nobody but the person who asked, so they run at any hour and name their
  // edition; a send to subscribers runs only at its own time.
  const operator = Boolean(dryRun || testTo || previewTo)
  const asked = request.nextUrl.searchParams.get('edition')

  /*
   * THE WEEK or THE WEEKEND, AND ONLY AT ITS TIME (law 45 (a)): THE WEEK from 07:00 on Wednesday and THE WEEKEND from
   * 07:00 on Friday, Melbourne time, whatever the daylight saving offset (src/lib/newsletter/send-time.ts). The edition of
   * a send to subscribers is the clock's, never a parameter's: one that names the other edition is refused, so a
   * hand-run cannot send THE WEEKEND on a Wednesday. Each edition has its own send record since 20261121170001.
   */
  let edition: DigestEdition
  if (operator) {
    edition = asked === 'weekend' ? 'weekend' : 'week'
  } else {
    const moment = sendMoment(now)
    if (moment.edition === null) {
      return NextResponse.json({ ok: true, skipped: 'not_the_hour', why: moment.why })
    }
    if (asked && asked !== moment.edition) {
      return NextResponse.json({ ok: false, error: `edition=${asked} is not this hour's edition (${moment.edition})` }, { status: 400 })
    }
    edition = moment.edition
  }
  const freshPeriod = resolveDigestPeriod(now, edition)
  // NL-1 (law 46): design=whats-on rehearses Lawal's design A on an operator call; a send to subscribers draws design A
  // only once NEWSLETTER_DESIGN_A_LIVE says so (src/lib/newsletter/design-a-live.ts, where the reasons it waits are).
  const design: 'whats-on' | 'built' = operator
    ? request.nextUrl.searchParams.get('design') === 'whats-on' && (previewTo || testTo) ? 'whats-on' : 'built'
    : NEWSLETTER_DESIGN_A_LIVE ? 'whats-on' : 'built'

  const cities = onlyCity ? [onlyCity] : editionDigestCities(await fetchDigestCities(admin))
  const results: Record<string, unknown>[] = []
  let sentTotal = 0

  for (const citySlug of cities) {
    const { data: city, error: cityError } = await admin
      .from('cities')
      .select('slug, name')
      .eq('slug', citySlug)
      .maybeSingle()
    if (cityError) {
      // A city that cannot be READ is not a city that does not exist. Saying
      // so is the difference between an operator fixing a database and an
      // operator deleting a city slug that was always correct.
      results.push({ city: citySlug, skipped: 'city_unreadable', error: cityError.message })
      continue
    }
    if (!city) {
      results.push({ city: citySlug, skipped: 'unknown_city' })
      continue
    }

    /*
     * IDEMPOTENCE, AND THE ROW THAT IS STILL OPEN.
     *
     * The most recent row for this city inside the idempotence window, not
     * today's row: see `earliestPeriodStillThisWeek`. A row with `completed_at`
     * set means the whole audience received this week's email and there is
     * nothing to do. A row WITHOUT it means the last invocation stopped at its
     * per-run cap, so this one resumes that period rather than opening a new
     * one, and the people it still owes get the same week's email.
     */
    const { data: openRows, error: openError } = await admin
      .from('digest_sends')
      .select('id, period_start, period_end, recipient_count, audience_count, completed_at')
      .eq('city_slug', citySlug)
      // Each edition's own record (law 45 (a), 20261121170001): Wednesday's week row never stops Friday's weekend.
      .eq('edition', edition)
      .gte('period_start', earliestPeriodStillThisWeek(now))
      .order('period_start', { ascending: false })
      .limit(1)
    if (openError) {
      // Fail CLOSED. An unreadable audit row cannot say whether this city has
      // already been written to, and the cost of guessing wrong is a second
      // copy of a marketing email.
      results.push({ city: citySlug, skipped: 'idempotence_unreadable', error: openError.message })
      continue
    }
    const already = openRows?.[0] ?? null
    const live = !dryRun && !testTo && !previewTo
    if (already?.completed_at && live) {
      results.push({ city: citySlug, skipped: 'already_sent_this_period' })
      continue
    }

    // A resumed run keeps the period it is resuming; anything else opens the
    // current one.
    const period =
      already && !already.completed_at
        ? { start: already.period_start, end: already.period_end }
        : freshPeriod

    let candidates: Awaited<ReturnType<typeof fetchDigestRecipients>>
    let events: Awaited<ReturnType<typeof fetchDigestEvents>>
    try {
      ;[candidates, events] = await Promise.all([
        fetchDigestRecipients(admin, citySlug),
        // The origin is what turns each event row into a tracked short link, so
        // the clicks this send produces reach the organiser's reach panel.
        fetchDigestEvents(admin, citySlug, period, 10, origin, city.name, now),
      ])
    } catch (error) {
      /*
       * FAIL CLOSED, AND THIS CATCH IS THE POINT OF THE WHOLE PASS.
       *
       * `fetchDigestRecipients` raises when it cannot read the audience or the
       * SUPPRESSION list in full. It used to swallow that: a failed suppression
       * read left the list empty and every address that had withdrawn was put
       * back into the send by its waitlist row. Skipping the city costs one
       * week of one city's marketing email. The other answer costs us writing
       * to people who asked us to stop.
       */
      results.push({
        city: citySlug,
        skipped: 'audience_unreadable',
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    /*
     * THE RESOLVER IS THE DOOR, close-out GA1.
     *
     * The two consent sources this route already merged each carry their own
     * rules, and both of them decide by reading a CURRENT state. The ledger
     * decides by reading the EVIDENCE: the latest recorded event for this
     * tenant, purpose and person, the channel it covers, its age, and any
     * suppression recorded since. Every address the digest is about to write
     * to is put to it, and a refusal is counted rather than swallowed, because
     * "we did not send" is only worth something if it can say why.
     *
     * It can only ever REMOVE somebody from a list this route already built,
     * so the failure mode is a marketing email that does not go out.
     */
    const verdicts = await filterPermittedRecipients(
      admin,
      candidates.map((r) => r.email),
      { purpose: LOCAL_DIGEST_PURPOSE, channel: 'email' },
    )
    const permitted = new Set(verdicts.permitted)
    const recipients = candidates.filter((r) => permitted.has(r.email.toLowerCase()))
    const refusedByLedger = verdicts.refused.length

    if (events.length === 0) {
      results.push({ city: citySlug, skipped: 'no_events', recipients: recipients.length })
      continue
    }

    if (dryRun) {
      results.push({
        city: citySlug,
        dryRun: true,
        recipients: recipients.length,
        // Source is named per address so the bridge is legible in the probe:
        // 'waitlist' is a person the digest could not reach before.
        recipientEmails: recipients.map((r) => `${r.email} (${r.source})`),
        refusedByLedger,
        refusalReasons: verdicts.refused.map((r) => `${r.email}: ${r.reason}`),
        events: events.length,
        eventTitles: events.map((e) => e.title),
        eventUrls: events.map((e) => e.url),
        period,
      })
      continue
    }

    if (previewTo) {
      // Render only. Nothing is sent and nothing is written, so this is safe
      // to run against a live audience at any time.
      const own = recipients.find((r) => r.email === previewTo.toLowerCase())
      const unsubscribeUrl = own ? `${origin}/unsubscribe/digest/${own.unsubscribeToken}` : `${origin}/account/notifications`
      // NL-1: design=whats-on draws Lawal's design A from the edition's own reads (src/lib/newsletter); its slots that
      // failed the copy gate are said in leftOut.
      const built =
        design === 'whats-on'
          ? buildWhatsOn((await readWhatsOnEdition(admin, { citySlug, cityName: city.name, edition, now, origin, unsubscribeUrl, recipientToken: own?.unsubscribeToken ?? null })).edition)
          : { ...buildDigestEmailHtml({ cityName: city.name, events, origin, edition, period, unsubscribeUrl }), leftOut: [] as string[] }
      results.push({
        city: citySlug,
        preview: {
          to: previewTo,
          recipientSource: own?.source ?? 'not-a-recipient',
          subject: built.subject,
          html: built.html,
          text: built.text,
          leftOut: built.leftOut,
        },
      })
      continue
    }

    if (testTo) {
      // One rehearsal send: the real template, a real unsubscribe link for
      // the address when it has a consent row, no audit row written.
      const own = recipients.find((r) => r.email === testTo.toLowerCase())
      const token = own?.unsubscribeToken
      const unsubscribeUrl = token ? `${origin}/unsubscribe/digest/${token}` : `${origin}/account/notifications`
      const { subject, html, text } =
        design === 'whats-on'
          ? buildWhatsOn((await readWhatsOnEdition(admin, { citySlug, cityName: city.name, edition, now, origin, unsubscribeUrl, recipientToken: token ?? null })).edition)
          : buildDigestEmailHtml({ cityName: city.name, events, origin, edition, period, unsubscribeUrl })
      await sendEmail({
        to: testTo,
        subject,
        html,
        text,
        messageType: 'platform_weekly_digest',
        recipientRole: 'platform_owner',
        /*
         * The rehearsal is supposed to be the real message. When the address
         * has a consent row it gets the real token and therefore the real
         * headers; when it does not, the body link already falls back to the
         * account page and there is no token to point a one-click at, so no
         * pair is composed rather than one that names a token nobody holds.
         */
        ...(token ? { headers: oneClickUnsubscribeHeaders(origin, token) } : {}),
      })
      results.push({ city: citySlug, testSentTo: testTo, events: events.length })
      continue
    }

    /*
     * NO WEEKLY APPROVAL; THE ENGINE'S OWN CHECKS GATE THE SEND (Lawal, 21 November 2026, 02:09: "no need of approval";
     * the PM's 02:10: "roundup_approvals no longer gates a send; the engine's own content checks do"). Until then a city
     * went to its subscribers only once an admin approved its edition on /admin/roundup. The checks that stand: the
     * audience through the consent ledger above, the nights read at send time (a night ended, cancelled or no longer
     * listed is not carried), at least one night to send, and, for design A, the copy gate per pick (buildWhatsOn leaves
     * out a slot that fails it) with at least one pick left. A failed read skips the city and says so, never sends it.
     */
    let designA: Awaited<ReturnType<typeof readWhatsOnEdition>> | null = null
    if (design === 'whats-on') {
      try {
        designA = await readWhatsOnEdition(admin, { citySlug, cityName: city.name, edition, now, origin, unsubscribeUrl: `${origin}/account/notifications`, recipientToken: null })
      } catch (error) {
        results.push({ city: citySlug, skipped: 'edition_unreadable', error: error instanceof Error ? error.message : String(error) })
        continue
      }
      if (!designA.edition.featured && designA.edition.highlights.length === 0) {
        results.push({ city: citySlug, skipped: 'no_picks', recipients: recipients.length })
        continue
      }
    }

    /*
     * THE WINDOW THIS INVOCATION MAY WRITE TO, and the reason it is a function
     * call rather than a `.slice(`.
     *
     * It was `recipients.slice(0, MAX_RECIPIENTS_PER_RUN)`, and then the
     * `digest_sends` row was written unconditionally, so the next invocation
     * read that row and answered `already_sent_this_period`. A city with nine
     * hundred lawful recipients sent to five hundred of them and the other four
     * hundred did not receive that week's email at all. The row recorded 500
     * with nothing to read it against. Every scanner in this repository judged
     * that slice bounded, and it was: a bound is not the same thing as safety.
     *
     * `planDigestRun` is pure and exhaustively tested, and it answers with what
     * is still owed as well as what to send, so the caller cannot take the
     * window without also being handed the remainder.
     */
    const plan = planDigestRun({
      audience: recipients,
      alreadySent: already?.recipient_count ?? 0,
      cap: DIGEST_MAX_RECIPIENTS_PER_RUN,
    })

    /*
     * THE ROW IS CLAIMED BEFORE THE FIRST EMAIL GOES. Vercel: "Cron delivery can also occasionally invoke the same
     * scheduled run more than once" (https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs, read 21 November
     * 2026). A period with no row is opened here, under the unique key (city_slug, edition, period_start); a second
     * invocation that reaches this line for the same period meets that key and stops, so two firings never both write
     * to the city. A resumed period already has its row and carries on from it.
     */
    let rowId: string | null = already?.id ?? null
    if (!rowId) {
      const claim = await admin
        .from('digest_sends')
        .insert({ city_slug: citySlug, edition, period_start: period.start, period_end: period.end, event_count: events.length, recipient_count: 0, audience_count: plan.audience, completed_at: null })
        .select('id')
        .single()
      if (claim.error || !claim.data) {
        const taken = claim.error?.code === '23505'
        results.push({ city: citySlug, skipped: taken ? 'claimed_by_another_run' : 'claim_unwritable', ...(taken ? {} : { error: claim.error?.message ?? 'no row returned' }) })
        continue
      }
      rowId = claim.data.id
    }

    let sent = 0
    for (const recipient of plan.toSend) {
      const { subject, html, text } = subscriberLetter({
        origin,
        edition,
        citySlug,
        cityName: city.name,
        period,
        token: recipient.unsubscribeToken,
        events,
        designA,
      })
      try {
        await sendEmail({
          to: recipient.email,
          subject,
          html,
          text,
          messageType: 'attendee_event_alert',
          recipientRole: 'prospect',
          /*
           * The one-click pair, from the SAME token the body link carries, so
           * the button a mail client draws and the link a person presses
           * withdraw one person's consent and not two different things. This is
           * the send Google's bulk-sender rule is about: one city list, one
           * message each, promoting other organisers' events.
           */
          headers: oneClickUnsubscribeHeaders(origin, recipient.unsubscribeToken),
        })
        sent += 1
      } catch {
        // One bad address never stops the run; the count stays honest.
      }
    }
    sentTotal += sent

    /*
     * THE ROW IS OPENED WHEN THE SEND STARTS AND CLOSED WHEN THE AUDIENCE IS
     * COVERED, so `completed_at` is what the next invocation reads to tell
     * "finished" from "started". `recipient_count` is the running total and is
     * the resume point, which is why it is written as a sum and never as this
     * run's `sent` alone.
     *
     * COMPLETION IS JUDGED ON WHAT WAS ACTUALLY WRITTEN, not on the window that
     * was planned. A send that throws is swallowed below so one bad address
     * cannot stop the run, and counting the plan rather than the sends would
     * close the period over the top of everybody that failed.
     */
    const written = (already?.recipient_count ?? 0) + sent
    const complete = written >= plan.audience
    const audit = {
      event_count: events.length,
      recipient_count: written,
      audience_count: plan.audience,
      completed_at: complete ? new Date().toISOString() : null,
    }
    // The row this run claimed or resumed; its city, edition and period were written when it was opened.
    const { error: auditError } = await admin.from('digest_sends').update(audit).eq('id', rowId)

    results.push({
      city: citySlug,
      sent,
      written,
      audience: plan.audience,
      remaining: plan.audience - written,
      complete,
      events: events.length,
      refusedByLedger,
      /*
       * A FAILED AUDIT WRITE IS REPORTED RATHER THAN SWALLOWED. It used to be
       * discarded, which on the old code meant a city could be mailed every
       * single week's run with no record that it had been; on this code it
       * means the resume point did not move and the same window would be sent
       * again. Either way it is the one write in this route that must be
       * visible when it fails.
       */
      ...(auditError ? { auditWriteFailed: auditError.message } : {}),
    })
  }

  // The period the run would OPEN. A city resuming an unfinished week reports
  // its own period in its own result row, which is the only place that can
  // be correct when two cities are on different periods in one invocation.
  return NextResponse.json({ ok: true, period: freshPeriod, sentTotal, cities: results })
}

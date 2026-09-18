import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron/auth'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import {
  buildDigestEmailHtml,
  fetchDigestCities,
  fetchDigestEvents,
  fetchDigestRecipients,
  resolveDigestPeriod,
} from '@/lib/broadcast/digest'
import { filterPermittedRecipients } from '@/lib/consent/resolver'
import { LOCAL_DIGEST_PURPOSE } from '@/lib/consent/purposes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The weekly local digest cron (SPEC 3.2). CRON_SECRET-guarded (fail
 * closed), flag-gated on broadcast_digest, and idempotent per city per
 * period through the digest_sends unique key, so a re-run can never double
 * send.
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

const MAX_RECIPIENTS_PER_RUN = 500

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(request)
  if (denied) return denied

  if (!(await isFeatureEnabled('broadcast_digest'))) {
    return NextResponse.json({ ok: true, skipped: 'flag_off' })
  }

  const admin = createAdminClient()
  const origin = getSiteUrl()
  const period = resolveDigestPeriod(new Date())

  const onlyCity = request.nextUrl.searchParams.get('city')
  const dryRun = request.nextUrl.searchParams.get('dry_run') === '1'
  const testTo = request.nextUrl.searchParams.get('test_to')
  const previewTo = request.nextUrl.searchParams.get('preview_to')

  const cities = onlyCity ? [onlyCity] : await fetchDigestCities(admin)
  const results: Record<string, unknown>[] = []
  let sentTotal = 0

  for (const citySlug of cities) {
    const { data: city } = await admin
      .from('cities')
      .select('slug, name')
      .eq('slug', citySlug)
      .maybeSingle()
    if (!city) {
      results.push({ city: citySlug, skipped: 'unknown_city' })
      continue
    }

    // Idempotence: one send per city per period, enforced by the unique key
    // and pre-checked here so a re-run is a cheap no-op.
    const { data: already } = await admin
      .from('digest_sends')
      .select('id')
      .eq('city_slug', citySlug)
      .eq('period_start', period.start)
      .maybeSingle()
    if (already && !dryRun && !testTo && !previewTo) {
      results.push({ city: citySlug, skipped: 'already_sent_this_period' })
      continue
    }

    const [candidates, events] = await Promise.all([
      fetchDigestRecipients(admin, citySlug),
      // The origin is what turns each event row into a tracked short link, so
      // the clicks this send produces reach the organiser's reach panel.
      fetchDigestEvents(admin, citySlug, period, 10, origin, city.name),
    ])

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
      const built = buildDigestEmailHtml({
        cityName: city.name,
        events,
        origin,
        unsubscribeUrl: own
          ? `${origin}/unsubscribe/digest/${own.unsubscribeToken}`
          : `${origin}/account/notifications`,
      })
      results.push({
        city: citySlug,
        preview: {
          to: previewTo,
          recipientSource: own?.source ?? 'not-a-recipient',
          subject: built.subject,
          html: built.html,
          text: built.text,
        },
      })
      continue
    }

    if (testTo) {
      // One rehearsal send: the real template, a real unsubscribe link for
      // the address when it has a consent row, no audit row written.
      const own = recipients.find((r) => r.email === testTo.toLowerCase())
      const token = own?.unsubscribeToken
      const { subject, html, text } = buildDigestEmailHtml({
        cityName: city.name,
        events,
        origin,
        unsubscribeUrl: token
          ? `${origin}/unsubscribe/digest/${token}`
          : `${origin}/account/notifications`,
      })
      await sendEmail({
        to: testTo,
        subject,
        html,
        text,
        messageType: 'platform_weekly_digest',
        recipientRole: 'platform_owner',
      })
      results.push({ city: citySlug, testSentTo: testTo, events: events.length })
      continue
    }

    let sent = 0
    for (const recipient of recipients.slice(0, MAX_RECIPIENTS_PER_RUN)) {
      const { subject, html, text } = buildDigestEmailHtml({
        cityName: city.name,
        events,
        origin,
        unsubscribeUrl: `${origin}/unsubscribe/digest/${recipient.unsubscribeToken}`,
      })
      try {
        await sendEmail({
          to: recipient.email,
          subject,
          html,
          text,
          messageType: 'attendee_event_alert',
          recipientRole: 'prospect',
        })
        sent += 1
      } catch {
        // One bad address never stops the run; the count stays honest.
      }
    }
    sentTotal += sent

    await admin.from('digest_sends').insert({
      city_slug: citySlug,
      period_start: period.start,
      period_end: period.end,
      event_count: events.length,
      recipient_count: sent,
    })

    results.push({ city: citySlug, sent, events: events.length, refusedByLedger })
  }

  return NextResponse.json({ ok: true, period, sentTotal, cities: results })
}

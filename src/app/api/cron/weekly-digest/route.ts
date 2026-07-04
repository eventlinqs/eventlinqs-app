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
    if (already && !dryRun && !testTo) {
      results.push({ city: citySlug, skipped: 'already_sent_this_period' })
      continue
    }

    const [recipients, events] = await Promise.all([
      fetchDigestRecipients(admin, citySlug),
      fetchDigestEvents(admin, citySlug, period),
    ])

    if (events.length === 0) {
      results.push({ city: citySlug, skipped: 'no_events', recipients: recipients.length })
      continue
    }

    if (dryRun) {
      results.push({
        city: citySlug,
        dryRun: true,
        recipients: recipients.length,
        recipientEmails: recipients.map((r) => r.email),
        events: events.length,
        eventTitles: events.map((e) => e.title),
        period,
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
      await sendEmail({ to: testTo, subject, html, text })
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
        await sendEmail({ to: recipient.email, subject, html, text })
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

    results.push({ city: citySlug, sent, events: events.length })
  }

  return NextResponse.json({ ok: true, period, sentTotal, cities: results })
}

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { escapeHtml } from '@/lib/email/escape'
import { formatMoneyDisplay } from '@/lib/money/format'
import { captureException } from '@/lib/observability/sentry'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readEveryRowIn } from '@/lib/supabase/read-every-row-in'
import { resolveOrganisationOwnerEmail } from './organiser-recipient'

/**
 * THE DAILY SALES DIGEST. Close-out MONEY FIX, part B, step B4.
 *
 * WHY IT IS NOT OPTIONAL. `daily` is the DEFAULT sales notification mode, so
 * without this sweep the default setting means an organiser hears about their
 * first sale on an event and then never hears about a sale again. That is a
 * quieter version of the exact defect this item exists to end, and it would
 * have been introduced by the fix. The policy returns `hold_for_digest`; this
 * is what makes "held" mean "sent later" rather than "dropped".
 *
 * IDEMPOTENT BY PRIMARY KEY, not by a flag. `organiser_sales_digest_sends` is
 * keyed (organisation_id, digest_date) and the insert is the claim: a second
 * run for the same platform day conflicts and sends nothing. A cron is retried,
 * and the only thing worse than not being told about your money is being told
 * twice and not knowing which is true.
 *
 * THE DAY IS THE PLATFORM'S DAY. `PLATFORM_TIME_ZONE`, the same one the owner's
 * notification ceiling uses, so an organiser's "yesterday" is a day a person can
 * predict rather than a UTC window that moves under them twice a year.
 */

type AdminClient = SupabaseClient

export interface DigestSaleRow {
  orderNumber: string
  eventTitle: string
  totalCents: number
  currency: string
}

export interface DigestSweepSummary {
  organisationsConsidered: number
  sent: number
  skippedNoSales: number
  skippedAlreadySent: number
  skippedNoRecipient: number
  failed: number
}

/**
 * The platform day that has just finished, as `YYYY-MM-DD`.
 *
 * Exported and pure so the boundary is testable without waiting for midnight.
 */
export function previousPlatformDay(now: Date, zone: string = PLATFORM_TIME_ZONE): string {
  const todayInZone = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const [y, m, d] = todayInZone.split('-').map(Number)
  // Constructed in UTC purely to do date arithmetic on a calendar date that has
  // already been resolved in the platform's zone; no zone conversion happens
  // here, so a DST change cannot shift the answer by a day.
  const asUtc = Date.UTC(y, m - 1, d)
  return new Date(asUtc - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** The UTC instants bounding a platform day, for the orders query. */
export function platformDayBounds(
  day: string,
  zone: string = PLATFORM_TIME_ZONE,
): { startIso: string; endIso: string } {
  // Resolve the zone's offset at midday on that day, which is never ambiguous
  // even on a DST boundary, then bound the day from it.
  const middayUtc = new Date(`${day}T12:00:00Z`)
  const zoned = new Date(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(middayUtc)
      .replace(/(\d+)\/(\d+)\/(\d+),?\s/, '$3-$1-$2T') + 'Z',
  )
  const offsetMs = zoned.getTime() - middayUtc.getTime()
  const startUtc = new Date(Date.parse(`${day}T00:00:00Z`) - offsetMs)
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString() }
}

/**
 * Send yesterday's digest to every organisation on the daily preference.
 *
 * Organisations on 'immediate' already heard about each sale as it happened,
 * and organisations on 'off' asked not to hear, so neither is selected.
 */
export async function runOrganiserSalesDigest(
  admin: AdminClient,
  now: Date = new Date(),
): Promise<DigestSweepSummary> {
  const day = previousPlatformDay(now)
  const { startIso, endIso } = platformDayBounds(day)

  const summary: DigestSweepSummary = {
    organisationsConsidered: 0,
    sent: 0,
    skippedNoSales: 0,
    skippedAlreadySent: 0,
    skippedNoRecipient: 0,
    failed: 0,
  }

  /*
   * EVERY ORGANISER ON DAILY MODE, NOT THE FIRST THOUSAND OF THEM. `daily` is
   * the DEFAULT sales notification mode, so this set is not a subset of the
   * platform's organisers, it is very nearly all of them. An unbounded read here
   * meant that past the row ceiling an organiser's digest simply never ran, and
   * the summary this function returns would have said so in no way at all.
   */
  const orgs = await readEveryRow<{ id: string; name: string }>(
    'organisations on the daily sales digest',
    (from, to) =>
      admin
        .from('organisations')
        .select('id, name')
        .eq('sales_notification_mode', 'daily')
        .order('id')
        .range(from, to),
  )

  for (const org of orgs) {
    summary.organisationsConsidered += 1
    try {
      /*
       * THE ORDERS ARE THE MONEY, AND A SAMPLE OF THEM IS A WRONG TOTAL.
       *
       * This read was unbounded, so an organiser who sold more than the row
       * ceiling in one platform day was emailed a digest built from the first
       * thousand orders: a smaller number of sales and a smaller amount of money
       * than they actually took, with nothing on the page to say it was partial.
       *
       * `confirmed_at` is not unique, so it cannot settle a page boundary on its
       * own; `order_number` is, and the two together are the stable total order
       * paging requires.
       */
      const orders = await readEveryRow<{
        order_number: string
        total_cents: number
        currency: string
        event_id: string
        confirmed_at: string
      }>(`confirmed orders for ${org.id as string}`, (from, to) =>
        admin
          .from('orders')
          .select('order_number, total_cents, currency, event_id, confirmed_at')
          .eq('organisation_id', org.id as string)
          .eq('status', 'confirmed')
          .gte('confirmed_at', startIso)
          .lt('confirmed_at', endIso)
          .order('confirmed_at', { ascending: true })
          .order('order_number')
          .range(from, to),
      )

      if (orders.length === 0) {
        summary.skippedNoSales += 1
        continue
      }

      /*
       * CLAIM THE DAY BEFORE SENDING, never after. If the send throws after a
       * successful insert the organiser misses one digest; if the insert
       * happened after the send, a crash between them would send the same day
       * again on the next run. Missing one is recoverable and visible; sending
       * a duplicate money summary is neither.
       */
      const gross = orders.reduce((n, o) => n + Number(o.total_cents ?? 0), 0)
      const currency = (orders[0].currency as string) ?? 'AUD'
      const { error: claimError } = await admin
        .from('organiser_sales_digest_sends')
        .insert({
          organisation_id: org.id as string,
          digest_date: day,
          sale_count: orders.length,
          gross_cents: gross,
          currency,
        })
      if (claimError) {
        // A unique violation is the idempotency working, not a failure.
        summary.skippedAlreadySent += 1
        continue
      }

      const recipient = await resolveOrganisationOwnerEmail(admin, org.id as string)
      if (!recipient) {
        summary.skippedNoRecipient += 1
        continue
      }

      const titles = await loadEventTitles(
        admin,
        orders.map((o) => o.event_id as string),
      )
      const rows: DigestSaleRow[] = orders.map((o) => ({
        orderNumber: (o.order_number as string) ?? '',
        eventTitle: titles.get(o.event_id as string) ?? 'your event',
        totalCents: Number(o.total_cents ?? 0),
        currency: (o.currency as string) ?? 'AUD',
      }))

      const { subject, html, text } = buildDigestEmail({ day, rows, grossCents: gross, currency })
      await sendEmail({
        to: recipient.email,
        subject,
        html,
        text,
        messageType: 'organiser_sales_digest',
        recipientRole: 'organiser',
      })
      summary.sent += 1
    } catch (err) {
      summary.failed += 1
      captureException(err, {
        where: 'notifications/organiser-sales-digest',
        organisation_id: org.id as string,
      })
    }
  }

  return summary
}

async function loadEventTitles(
  admin: AdminClient,
  eventIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(eventIds.filter(Boolean))]
  if (unique.length === 0) return new Map()
  // Chunked because the id list travels in the URL, paged because the answer
  // travels in one response. A busy organiser's day spans plenty of events.
  const rows = await readEveryRowIn<{ id: string; title: string | null }>(
    'event titles for the daily sales digest',
    unique,
    (chunk, from, to) =>
      admin.from('events').select('id, title').in('id', chunk).order('id').range(from, to),
  )
  return new Map(rows.map((e) => [e.id, e.title ?? 'your event']))
}

/**
 * The copy. Australian English, no dashes of any kind, no exclamation marks.
 * Pure, so the wording is tested without a mailbox.
 */
export function buildDigestEmail(input: {
  day: string
  rows: DigestSaleRow[]
  grossCents: number
  currency: string
}): { subject: string; html: string; text: string } {
  const total = formatMoneyDisplay(input.grossCents, input.currency)
  const count = input.rows.length
  const noun = count === 1 ? 'sale' : 'sales'

  const subject = `Your sales for ${input.day}: ${count} ${noun}, ${total}`
  const title = `${count} ${noun} on ${input.day}`

  const lines = [
    `You took ${total} across ${count} ${noun}.`,
    'The money is held for you and is paid out after each event, less the EventLinqs fee.',
  ]

  const listText = input.rows.map(
    (r) => `  ${r.eventTitle}: ${formatMoneyDisplay(r.totalCents, r.currency)} (order ${r.orderNumber})`,
  )

  const origin = getSiteUrl().replace(/\/$/, '')
  const cta = { label: 'Open your dashboard', url: `${origin}/dashboard/events` }

  const text = [
    title,
    '',
    ...lines,
    '',
    ...listText,
    '',
    `${cta.label}: ${cta.url}`,
    '',
    'Change how often you hear about sales in your organiser settings.',
  ].join('\n')

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1628">`,
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>`,
    ...lines.map(
      (l) => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escapeHtml(l)}</p>`,
    ),
    `<table style="width:100%;border-collapse:collapse;margin:16px 0">`,
    ...input.rows.map(
      (r) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px">${escapeHtml(r.eventTitle)}<br><span style="color:#4a5568">order ${escapeHtml(r.orderNumber)}</span></td>` +
        `<td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;text-align:right;white-space:nowrap">${escapeHtml(formatMoneyDisplay(r.totalCents, r.currency))}</td></tr>`,
    ),
    `</table>`,
    `<p style="margin:24px 0"><a href="${cta.url}" style="background:#0A1628;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(cta.label)}</a></p>`,
    `<p style="font-size:13px;line-height:1.5;margin:0;color:#4a5568">Change how often you hear about sales in your organiser settings.</p>`,
    `</div>`,
  ].join('')

  return { subject, html, text }
}

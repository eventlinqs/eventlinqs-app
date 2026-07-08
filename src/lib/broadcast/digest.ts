import { createAdminClient } from '@/lib/supabase/admin'
import { priceLabel } from '@/lib/events/price-label'

/**
 * The weekly local digest (Broadcast Layer SPEC 3.2): one city-scoped email
 * per week to recipients with a granted marketing_consents row for that
 * city, carrying this week's published events. Locality is the existing
 * cities taxonomy, one source of truth.
 *
 * Spam Act 2003 posture: recipients come exclusively from
 * marketing_consents status='granted' (no consent, no email, ever), the
 * sender is identified in the footer, and every email carries that
 * recipient's own one-tap unsubscribe link.
 */

export interface DigestRecipient {
  email: string
  unsubscribeToken: string
}

export interface DigestEvent {
  slug: string
  title: string
  dateLabel: string
  venueLabel: string
  priceLabel: string
}

type Admin = ReturnType<typeof createAdminClient>

/** The digest period: the seven days from the send date. */
export function resolveDigestPeriod(now: Date): { start: string; end: string } {
  const start = now.toISOString().slice(0, 10)
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const end = endDate.toISOString().slice(0, 10)
  return { start, end }
}

/** Cities that currently have at least one granted digest consent. */
export async function fetchDigestCities(admin: Admin): Promise<string[]> {
  const { data } = await admin
    .from('marketing_consents')
    .select('city_slug')
    .eq('status', 'granted')
    .not('city_slug', 'is', null)
  const cities = new Set<string>()
  for (const row of (data ?? []) as { city_slug: string | null }[]) {
    if (row.city_slug) cities.add(row.city_slug)
  }
  return [...cities].sort()
}

/** Granted recipients for one city. Withdrawn rows are excluded here, which
 * is the mechanical guarantee behind "unsubscribe stops the next send". */
export async function fetchDigestRecipients(
  admin: Admin,
  citySlug: string,
): Promise<DigestRecipient[]> {
  const { data } = await admin
    .from('marketing_consents')
    .select('email, unsubscribe_token')
    .eq('status', 'granted')
    .eq('city_slug', citySlug)
  return ((data ?? []) as { email: string; unsubscribe_token: string }[]).map((r) => ({
    email: r.email,
    unsubscribeToken: r.unsubscribe_token,
  }))
}

/** This week's published events for the city, soonest first. */
export async function fetchDigestEvents(
  admin: Admin,
  citySlug: string,
  period: { start: string; end: string },
  limit = 10,
): Promise<DigestEvent[]> {
  const { data } = await admin
    .from('events')
    .select(
      'slug, title, start_date, timezone, venue_name, venue_city, status, visibility, is_seed_data, ticket_tiers(price, currency)',
    )
    .eq('city_primary', citySlug)
    .eq('status', 'published')
    .gte('start_date', `${period.start}T00:00:00Z`)
    .lte('start_date', `${period.end}T23:59:59Z`)
    .order('start_date', { ascending: true })
    .limit(limit * 2)

  type Row = {
    slug: string
    title: string
    start_date: string
    timezone: string | null
    venue_name: string | null
    venue_city: string | null
    visibility: string | null
    is_seed_data: boolean | null
    ticket_tiers: { price: number; currency: string | null }[] | null
  }

  return ((data ?? []) as Row[])
    .filter((e) => e.visibility !== 'private' && e.is_seed_data !== true)
    .slice(0, limit)
    .map((e) => ({
      slug: e.slug,
      title: e.title,
      dateLabel: new Date(e.start_date).toLocaleDateString('en-AU', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: e.timezone ?? 'Australia/Sydney',
      }),
      venueLabel: [e.venue_name, e.venue_city].filter(Boolean).join(', '),
      priceLabel: priceLabel(e.ticket_tiers ?? [], 'Free entry'),
    }))
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}

/**
 * The digest HTML. Light, on-brand, inline-styled, matching the alert email
 * language (see lib/notifications/dispatch.ts) so every EventLinqs email
 * reads as one voice. Sender identified, one-tap unsubscribe, both in the
 * footer of every send.
 */
export function buildDigestEmailHtml(input: {
  cityName: string
  events: DigestEvent[]
  origin: string
  unsubscribeUrl: string
}): { subject: string; html: string; text: string } {
  const subject = `This week in ${input.cityName}: ${input.events.length} ${
    input.events.length === 1 ? 'event' : 'events'
  } worth a look`

  const rows = input.events
    .map(
      (e) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e7e9ee">
          <p style="margin:0;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#9a7b1f;font-weight:700">${escapeHtml(e.dateLabel)}</p>
          <p style="margin:4px 0 2px;font-size:16px;line-height:1.4;color:#0A1628;font-weight:700">
            <a href="${escapeAttr(`${input.origin}/events/${e.slug}`)}" style="color:#0A1628;text-decoration:none">${escapeHtml(e.title)}</a>
          </p>
          <p style="margin:0;font-size:13px;color:#4A4A4A">${escapeHtml(e.venueLabel)}${e.venueLabel ? ' · ' : ''}${escapeHtml(e.priceLabel)}</p>
        </td>
      </tr>`,
    )
    .join('')

  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="margin:0 0 14px;font-size:16px;font-weight:800;letter-spacing:.02em;color:#0A1628">EVENTLINQS<span style="color:#D4A017">.</span></p>
    <div style="background:#ffffff;border:1px solid #e7e9ee;border-radius:14px;padding:28px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a7b1f;font-weight:700">Your weekly local digest</p>
      <p style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#0A1628;font-weight:800">This week in ${escapeHtml(input.cityName)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      <a href="${escapeAttr(`${input.origin}/events`)}" style="display:inline-block;margin-top:20px;background:#0A1628;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">See everything on EventLinqs</a>
    </div>
    <p style="margin:18px 4px 0;font-size:11px;color:#8b919c">You asked us to keep you posted on events in your area. <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline">Unsubscribe with one tap</a> and this stops instantly.</p>
    <p style="margin:8px 4px 0;font-size:11px;color:#8b919c">EventLinqs, hello@eventlinqs.com</p>
  </div></body></html>`

  const text = [
    `This week in ${input.cityName}`,
    '',
    ...input.events.map((e) => `${e.dateLabel}: ${e.title} - ${e.venueLabel} - ${e.priceLabel}\n${input.origin}/events/${e.slug}`),
    '',
    `Unsubscribe: ${input.unsubscribeUrl}`,
    'EventLinqs, hello@eventlinqs.com',
  ].join('\n')

  return { subject, html, text }
}

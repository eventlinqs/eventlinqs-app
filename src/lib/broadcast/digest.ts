import { createAdminClient } from '@/lib/supabase/admin'
import { priceLabel } from '@/lib/events/price-label'
import { PUBLIC_VISIBILITY, isPubliclyDiscoverable } from '@/lib/events/visibility'
import { consentVersionCoversDigest } from '@/lib/waitlist/city-waitlist'
import { buildShortUrl, getOrCreateShareLink } from './share-links'
import {
  mergeDigestAudience,
  normaliseAudienceEmail,
  type ConsentAudienceRow,
  type DigestRecipient,
  type WaitlistAudienceRow,
} from './digest-audience'

/**
 * The weekly local digest (Broadcast Layer SPEC 3.2): one city-scoped email
 * per week carrying this week's published events. Locality is the existing
 * cities taxonomy, one source of truth.
 *
 * Spam Act 2003 posture: recipients come exclusively from recorded express
 * consent (no consent, no email, ever), from TWO sources joined here,
 * `marketing_consents` and the city waitlist. The rules that decide who is in
 * the audience live in `digest-audience.ts`, pure and tested. The sender is
 * identified in the footer, and every email carries that recipient's own
 * one-tap unsubscribe link, which works whichever list they arrived on.
 */

export type { DigestRecipient }

export interface DigestEvent {
  id: string
  slug: string
  title: string
  dateLabel: string
  venueLabel: string
  priceLabel: string
  /**
   * Where the email actually sends the reader. A tracked short link when one
   * could be minted, so the clicks the digest produces land in the
   * organiser's reach panel under "Weekly city email"; the plain event page
   * otherwise. Never empty, so a digest link is never dead.
   */
  url: string
}

type Admin = ReturnType<typeof createAdminClient>

/** The digest period: the seven days from the send date. */
export function resolveDigestPeriod(now: Date): { start: string; end: string } {
  const start = now.toISOString().slice(0, 10)
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const end = endDate.toISOString().slice(0, 10)
  return { start, end }
}

/**
 * Cities with at least one lawful recipient, across BOTH consent sources.
 * A city whose only audience is the waitlist is a real city with a real
 * audience, and before the bridge it was never even considered for a send.
 */
export async function fetchDigestCities(admin: Admin): Promise<string[]> {
  const [consents, waitlist] = await Promise.all([
    admin
      .from('marketing_consents')
      .select('city_slug')
      .eq('status', 'granted')
      .not('city_slug', 'is', null),
    admin
      .from('city_waitlist_signups')
      .select('city_slug, consent_version')
      .is('unsubscribed_at', null),
  ])

  const cities = new Set<string>()
  for (const row of (consents.data ?? []) as { city_slug: string | null }[]) {
    if (row.city_slug) cities.add(row.city_slug)
  }
  for (const row of (waitlist.data ?? []) as {
    city_slug: string | null
    consent_version: string | null
  }[]) {
    if (row.city_slug && consentVersionCoversDigest(row.consent_version)) {
      cities.add(row.city_slug)
    }
  }
  return [...cities].sort()
}

/**
 * The send list for one city: granted consent rows plus digest-covering
 * waitlist rows, minus every address that has withdrawn, deduplicated.
 *
 * Withdrawn rows are excluded at the query and again in the merge, which is
 * the mechanical guarantee behind "unsubscribe stops the next send" holding
 * across both lists rather than only the one the person unsubscribed from.
 */
export async function fetchDigestRecipients(
  admin: Admin,
  citySlug: string,
): Promise<DigestRecipient[]> {
  const [consentResult, waitlistResult] = await Promise.all([
    admin
      .from('marketing_consents')
      .select('email, unsubscribe_token, status')
      .eq('status', 'granted')
      .eq('city_slug', citySlug),
    admin
      .from('city_waitlist_signups')
      .select('email, unsubscribe_token, consent_version, unsubscribed_at')
      .eq('city_slug', citySlug)
      .is('unsubscribed_at', null),
  ])

  const consents = (consentResult.data ?? []) as ConsentAudienceRow[]
  const waitlist = (waitlistResult.data ?? []) as WaitlistAudienceRow[]

  // Suppression: an address that withdrew stays out even when a waitlist row
  // would otherwise re-add it. Scoped to the waitlist addresses, because the
  // consent rows above are already filtered to granted.
  const waitlistEmails = [...new Set(waitlist.map((r) => normaliseAudienceEmail(r.email)))]
  let suppressed: string[] = []
  if (waitlistEmails.length > 0) {
    const { data } = await admin
      .from('marketing_consents')
      .select('email')
      .eq('status', 'withdrawn')
      .in('email', waitlistEmails)
    suppressed = ((data ?? []) as { email: string }[]).map((r) => r.email)
  }

  return mergeDigestAudience({
    consents,
    waitlist,
    suppressed,
    coversDigest: consentVersionCoversDigest,
  })
}

/**
 * When the event starts, in its own timezone, WITH the time of day.
 *
 * Found by reading a real digest rather than by a test: the line read
 * "Wed, 12 Aug" for an event starting at 6pm. A what's-on email that does not
 * say what time to turn up has failed at the one job it has. Minutes are
 * dropped on the hour, the way a person writes it.
 */
export function digestDateLabel(startDate: string, timezone: string | null): string {
  const tz = timezone ?? 'Australia/Sydney'
  const when = new Date(startDate)
  const day = when
    .toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: tz,
    })
    // en-AU puts a comma after the weekday; one comma in the line is enough
    // once the time is appended ("Wed 12 Aug, 6pm").
    .replace(/,/g, '')
  const time = when
    .toLocaleTimeString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    })
    .replace(/:00(?=\s*[ap]m)/i, '')
    .replace(/\s+/g, '')
    .toLowerCase()
  return `${day}, ${time}`
}

/**
 * Where the event is, without telling a Geelong reader that an event is in
 * Geelong.
 *
 * Also found by reading: an event whose venue name was blank rendered its
 * locality alone, so the line said "Geelong" directly under the heading "This
 * week in Geelong". The city is already the whole premise of the email, so
 * repeating it carries no information. The venue name leads; the locality is
 * added only when it differs from the digest's own city; when neither says
 * anything new the label is empty and the price stands alone.
 */
export function digestVenueLabel(
  venueName: string | null,
  venueCity: string | null,
  digestCityName: string,
): string {
  const same = (a: string | null, b: string) =>
    (a ?? '').trim().toLowerCase() === b.trim().toLowerCase()
  const parts: string[] = []
  if (venueName?.trim()) parts.push(venueName.trim())
  if (venueCity?.trim() && !same(venueCity, digestCityName)) parts.push(venueCity.trim())
  return parts.join(', ')
}

/** This week's published events for the city, soonest first. */
export async function fetchDigestEvents(
  admin: Admin,
  citySlug: string,
  period: { start: string; end: string },
  limit = 10,
  origin = '',
  cityName = '',
): Promise<DigestEvent[]> {
  const { data } = await admin
    .from('events')
    .select(
      'id, slug, title, start_date, timezone, venue_name, venue_city, status, visibility, is_seed_data, ticket_tiers(price, currency)',
    )
    .eq('city_primary', citySlug)
    .eq('status', 'published')
    // Child safety, founder ruling 9 August 2026. This filter used to sit
    // downstream as `visibility !== 'private'`, which passed UNLISTED events
    // into an email blast. It is now an allow-list at the query, so a private
    // gathering cannot reach a stranger's inbox even if a later edit drops the
    // in-memory guard below.
    .eq('visibility', PUBLIC_VISIBILITY)
    .gte('start_date', `${period.start}T00:00:00Z`)
    .lte('start_date', `${period.end}T23:59:59Z`)
    .order('start_date', { ascending: true })
    .limit(limit * 2)

  type Row = {
    id: string
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

  const events = ((data ?? []) as Row[])
    // Defence in depth: the query already restricts to public, and this repeats
    // it through the one shared predicate. Two independent guards, because a
    // regression here emails a private address to a whole city.
    .filter((e) => isPubliclyDiscoverable(e.visibility) && e.is_seed_data !== true)
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      dateLabel: digestDateLabel(e.start_date, e.timezone),
      venueLabel: digestVenueLabel(e.venue_name, e.venue_city, cityName),
      priceLabel: priceLabel(e.ticket_tiers ?? [], 'Free entry'),
      url: `${origin}/events/${e.slug}`,
    }))

  return attachDigestShareLinks(admin, events, origin)
}

/**
 * Give each event in the digest a tracked short link on the `digest` channel,
 * so the clicks the weekly email produces are attributed in the organiser's
 * reach panel rather than vanishing.
 *
 * Best effort by design. If a link cannot be minted the event keeps its plain
 * event-page URL, because a digest that fails to send is worse than a digest
 * whose clicks are not counted. That also makes the code safe to deploy ahead
 * of migration 20260808000002, which is what widens the channel constraint to
 * accept 'digest'.
 */
async function attachDigestShareLinks(
  admin: Admin,
  events: DigestEvent[],
  origin: string,
): Promise<DigestEvent[]> {
  if (events.length === 0 || !origin) return events

  return Promise.all(
    events.map(async (event) => {
      try {
        const link = await getOrCreateShareLink(
          { eventId: event.id, channel: 'digest' },
          { client: admin },
        )
        return link ? { ...event, url: buildShortUrl(origin, link.code) } : event
      } catch {
        return event
      }
    }),
  )
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
            <a href="${escapeAttr(e.url)}" style="color:#0A1628;text-decoration:none">${escapeHtml(e.title)}</a>
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
    // Joined on the parts that exist. An unconditional separator printed
    // "Bridge Proof Night -  - Free entry" whenever a venue was unnamed:
    // found by reading the plain text part, which the HTML branch already
    // guarded and this one did not.
    ...input.events.map(
      (e) =>
        `${e.dateLabel}: ${[e.title, e.venueLabel, e.priceLabel].filter(Boolean).join(' - ')}\n${e.url}`,
    ),
    '',
    `Unsubscribe: ${input.unsubscribeUrl}`,
    'EventLinqs, hello@eventlinqs.com',
  ].join('\n')

  return { subject, html, text }
}

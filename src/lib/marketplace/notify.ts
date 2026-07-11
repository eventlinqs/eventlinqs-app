import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { chooseChannel, DEFAULT_PREFS, type NotificationPrefs } from '@/lib/notifications/policy'
import { isPushConfigured, sendWebPush, type StoredSubscription } from '@/lib/notifications/web-push'
import type { GigRow } from './gigs'
import { PERFORMANCE_TYPE_LABELS } from './gigs'

/**
 * Marketplace notifications ride the EXISTING alert rails (push-first, email
 * backbone, per-user prefs, one manage link) with their own dedupe key:
 * unique (user_id, type, subject_id), because a gig or a booking request is
 * the subject, not an event. The demand-engine dispatcher is untouched.
 *
 * Spam Act posture: every recipient is notified about THEIR OWN marketplace
 * activity (their gig, their application, a request addressed to them) or a
 * gig matching the availability they switched on themselves. Every email
 * identifies the sender and carries the manage link; the preference centre
 * and the availability toggle both stop future sends.
 */

type Admin = ReturnType<typeof createAdminClient>

export type MarketplaceNotificationType =
  | 'gig_posted'
  | 'gig_application'
  | 'booking_request'
  | 'booking_accepted'
  | 'mentoring_request'

export type MarketplaceDispatchInput = {
  admin: Admin
  userId: string
  type: MarketplaceNotificationType
  /** The row the notification is about (gig, application, request). One
   * notification per (user, type, subject), ever. */
  subjectId: string
  title: string
  body: string
  /** Absolute or site-relative destination; relative paths are resolved
   * against the site URL for email. */
  url: string
  ctaLabel: string
}

export type MarketplaceDispatchResult =
  | { status: 'sent'; channel: 'push' | 'email' }
  | { status: 'skipped'; reason: 'duplicate' | 'opted_out' | 'no_email' | 'send_failed' }

async function loadPrefs(admin: Admin, userId: string): Promise<NotificationPrefs> {
  const { data } = await admin
    .from('notification_prefs')
    .select('push_enabled, email_enabled, quiet_hours_start, quiet_hours_end, timezone')
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? DEFAULT_PREFS
}

async function resolveEmail(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle()
  return data?.email ?? null
}

export async function dispatchMarketplaceAlert(
  input: MarketplaceDispatchInput,
): Promise<MarketplaceDispatchResult> {
  const { admin, userId, type, subjectId } = input

  const { data: existing } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('subject_id', subjectId)
    .maybeSingle()
  if (existing) return { status: 'skipped', reason: 'duplicate' }

  const prefs = await loadPrefs(admin, userId)

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  const hasPush = isPushConfigured() && !!subs && subs.length > 0
  const channel = chooseChannel(prefs, hasPush)
  if (!channel) return { status: 'skipped', reason: 'opted_out' }

  const site = getSiteUrl().replace(/\/$/, '')
  const absoluteUrl = input.url.startsWith('http') ? input.url : `${site}${input.url}`
  // The push payload rides the AlertPayload shape the web-push sender takes;
  // marketplace types are outside the lifecycle union, hence the cast at
  // this one seam (the payload fields are identical).
  const payload = {
    type: type as unknown as import('@/lib/notifications/policy').NotificationType,
    title: input.title,
    body: input.body,
    url: absoluteUrl,
    tag: `marketplace:${subjectId}:${type}`,
  }

  let delivered: 'push' | 'email' | null = null

  if (channel === 'push' && subs) {
    let anyOk = false
    const gone: string[] = []
    for (const sub of subs as StoredSubscription[]) {
      const res = await sendWebPush(sub, payload)
      if (res.ok) anyOk = true
      if (res.gone) gone.push(sub.endpoint)
    }
    if (gone.length > 0) {
      await admin.from('push_subscriptions').delete().in('endpoint', gone)
    }
    if (anyOk) delivered = 'push'
  }

  if (!delivered && prefs.email_enabled) {
    const to = await resolveEmail(admin, userId)
    if (!to) return { status: 'skipped', reason: 'no_email' }
    try {
      const manageUrl = `${site}/account/notifications`
      await sendEmail({
        to,
        subject: input.title,
        html: marketplaceEmailHtml(payload, input.ctaLabel, manageUrl),
        text: `${payload.body}\n\n${payload.url}\n\nManage or turn off these alerts: ${manageUrl}\nEventLinqs, hello@eventlinqs.com`,
      })
      delivered = 'email'
    } catch {
      delivered = null
    }
  }

  if (!delivered) return { status: 'skipped', reason: 'send_failed' }

  await admin.from('notifications').insert({
    user_id: userId,
    event_id: null,
    subject_id: subjectId,
    type,
    channel: delivered,
    sent_at: new Date().toISOString(),
  })

  return { status: 'sent', channel: delivered }
}

/**
 * Alert performers whose showcase matches a freshly posted gig: available for
 * booking, based in the gig's city, doing the gig's performance type, with a
 * claimed account to notify. Capped and best-effort: a notify fault never
 * fails the posting.
 */
export async function notifyMatchingPerformers(admin: Admin, gig: GigRow): Promise<number> {
  const { data: artists } = await admin
    .from('artists')
    .select('id, owner_user_id')
    .eq('available_for_booking', true)
    .eq('city_slug', gig.city_slug)
    .contains('performance_types', [gig.performance_type])
    .not('owner_user_id', 'is', null)
    .limit(200)

  const typeLabel = PERFORMANCE_TYPE_LABELS[gig.performance_type] ?? gig.performance_type
  let sent = 0
  for (const artist of (artists ?? []) as { id: string; owner_user_id: string }[]) {
    const res = await dispatchMarketplaceAlert({
      admin,
      userId: artist.owner_user_id,
      type: 'gig_posted',
      subjectId: gig.id,
      title: 'New gig in your city',
      body: `${gig.title}: a ${typeLabel.toLowerCase()} gig is open for applications. You are seeing this because you are marked available for bookings.`,
      url: `/gigs/${gig.id}`,
      ctaLabel: 'View the gig',
    }).catch(() => ({ status: 'skipped' as const, reason: 'send_failed' as const }))
    if (res.status === 'sent') sent += 1
  }
  return sent
}

function marketplaceEmailHtml(
  payload: { title: string; body: string; url: string },
  ctaLabel: string,
  manageUrl: string,
): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:#ffffff;border:1px solid #e7e9ee;border-radius:14px;padding:28px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a7b1f;font-weight:700">${escapeHtml(payload.title)}</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#0A1628">${escapeHtml(payload.body)}</p>
      <a href="${escapeAttr(payload.url)}" style="display:inline-block;background:#0A1628;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">${escapeHtml(ctaLabel)}</a>
    </div>
    <p style="margin:18px 4px 0;font-size:11px;color:#8b919c">You are receiving this because of your performer marketplace activity on EventLinqs. <a href="${escapeAttr(manageUrl)}" style="color:#6b7280;text-decoration:underline">Manage or turn off these alerts</a>.</p>
    <p style="margin:8px 4px 0;font-size:11px;color:#8b919c">EventLinqs, hello@eventlinqs.com</p>
  </div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}

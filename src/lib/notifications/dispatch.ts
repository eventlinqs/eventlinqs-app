import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import {
  chooseChannel,
  buildAlertPayload,
  DEFAULT_PREFS,
  type NotificationType,
  type NotificationPrefs,
} from './policy'
import { isPushConfigured, sendWebPush, type StoredSubscription } from './web-push'

type Admin = SupabaseClient<Database>

export type DispatchInput = {
  admin: Admin
  userId: string
  eventId: string
  type: NotificationType
  ctx: {
    eventTitle: string
    eventCity?: string | null
    organiserName?: string | null
    url: string
    recipientEmail?: string | null
  }
}

export type DispatchResult =
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

/**
 * Dispatch a single lifecycle alert to one user, push-first with email fallback.
 *
 * Idempotent: the notifications table has a unique (user_id, event_id, type), so
 * a re-running cron never double-sends. We pre-check the row, choose the channel
 * from the user's prefs and whether they have a live push subscription, send,
 * prune any dead push endpoints, and record the outcome for instrumentation.
 */
export async function dispatchAlert(input: DispatchInput): Promise<DispatchResult> {
  const { admin, userId, eventId, type, ctx } = input

  // Dedupe: one alert per user per event per type, ever.
  const { data: existing } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('event_id', eventId)
    .eq('type', type)
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

  const payload = buildAlertPayload(type, ctx, eventId)

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

  // Email when email is the chosen channel, or as a fallback if every push send
  // failed but the user also allows email.
  if (!delivered && prefs.email_enabled) {
    const to = ctx.recipientEmail ?? (await resolveEmail(admin, userId))
    if (!to) return { status: 'skipped', reason: 'no_email' }
    try {
      const manageUrl = `${getSiteUrl().replace(/\/$/, '')}/account/notifications`
      await sendEmail({
        to,
        subject: `${payload.title}: ${ctx.eventTitle}`,
        html: alertEmailHtml(payload, manageUrl),
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
    event_id: eventId,
    type,
    channel: delivered,
    sent_at: new Date().toISOString(),
  })

  return { status: 'sent', channel: delivered }
}

async function resolveEmail(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle()
  return data?.email ?? null
}

function alertEmailHtml(payload: { title: string; body: string; url: string }, manageUrl: string): string {
  // Light, on-brand, inline-styled. Mirrors the platform navy/gold without
  // pulling a template dependency into a cron path. The footer identifies the
  // sender (EventLinqs + contact) and carries a working manage/unsubscribe link,
  // as a marketing-type message must under the Spam Act.
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="background:#ffffff;border:1px solid #e7e9ee;border-radius:14px;padding:28px">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a7b1f;font-weight:700">${escapeHtml(payload.title)}</p>
      <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:#0A1628">${escapeHtml(payload.body)}</p>
      <a href="${escapeAttr(payload.url)}" style="display:inline-block;background:#0A1628;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">View the event</a>
    </div>
    <p style="margin:18px 4px 0;font-size:11px;color:#8b919c">You are receiving this because you turned on event alerts on EventLinqs. <a href="${escapeAttr(manageUrl)}" style="color:#6b7280;text-decoration:underline">Manage or turn off these alerts</a>.</p>
    <p style="margin:8px 4px 0;font-size:11px;color:#8b919c">EventLinqs, hello@eventlinqs.com</p>
  </div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}

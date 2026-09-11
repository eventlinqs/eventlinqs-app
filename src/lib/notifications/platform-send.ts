import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { alertDestination } from '@/lib/env/destinations'
import { getSiteUrl } from '@/lib/site-url'
import { captureException } from '@/lib/observability/sentry'
import { isPushConfigured, sendWebPush, type StoredSubscription } from './web-push'
import {
  PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS,
  bodyFor,
  digestBodyFor,
  digestSubjectFor,
  platformDayStart,
  pushPayloadFor,
  routeFor,
  subjectFor,
  type PlatformNotificationKind,
  type PlatformNotificationRow,
} from './platform-policy'

/**
 * DELIVERY FOR THE OWNER'S NOTIFICATIONS. Close-out UX3.2 and UX3.3.
 *
 * The database trigger has already guaranteed the RECORD exists (see
 * supabase/migrations/20260909000002_platform_notifications.sql). This module
 * does the part a trigger must never do: talk to the network.
 *
 * UX3.2, IN FULL, BECAUSE THIS IS THE CLAUSE H2 WAS WRITTEN ABOUT.
 * "The notification path may not be able to fail silently. Every notification is
 * recorded as sent or failed, a failure is retried, and a persistent failure
 * raises through the second channel exactly as the smoke alert does."
 *
 *   RECORDED    every attempt writes attempts, last_attempt_at and last_error
 *               back to the row before it returns. There is no path through this
 *               module that leaves a row in the state it found it.
 *   RETRIED     a failed send stays `pending` with attempts incremented, so the
 *               next cron tick tries again. PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS
 *               bounds it.
 *   ESCALATED   after that, the SECOND CHANNEL: Web Push to the platform admins,
 *               which shares no vendor, no domain and no rate limit with Resend
 *               (the property scripts/ops/alert-dispatch.mjs picked its GitHub
 *               channel for). The push transport is Google, Mozilla or Apple,
 *               reached with our own VAPID keys.
 *   LOUD        if BOTH channels fail the row goes to `failed`, which is a state
 *               the admin feed renders in red and the exception is raised to
 *               Sentry. An undelivered alert is never allowed to look like a
 *               quiet day, because that is exactly what taught the owner that
 *               silence means healthy.
 *
 * WHY PUSH RATHER THAN A GITHUB ISSUE. The smoke alert runs on a CI runner that
 * is handed a GITHUB_TOKEN by Actions. This runs inside the deployed app, which
 * has no such token and must not be given repository write access to send an
 * operations alert. Push is the second channel this platform actually owns, and
 * it is armed from /admin/notifications in one click.
 */

type Admin = SupabaseClient

const SELECT_COLUMNS =
  'id, kind, occurred_at, actor_user_id, organisation_id, event_id, order_id, actor_label, organisation_name, event_title, summary, detail, admin_path, delivery_state, attempts, last_attempt_at, last_error, sent_at, channel'

export type DispatchSummary = {
  considered: number
  sent: number
  held: number
  escalated: number
  failed: number
  retried: number
}

/** Load the pending queue, oldest first, so an owner reads events in order. */
async function loadPending(admin: Admin, limit: number): Promise<PlatformNotificationRow[]> {
  const { data, error } = await admin
    .from('platform_notifications')
    .select(SELECT_COLUMNS)
    .eq('delivery_state', 'pending')
    .order('occurred_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`platform_notifications read failed: ${error.message}`)
  return (data ?? []) as unknown as PlatformNotificationRow[]
}

/**
 * How many notifications of this kind were already delivered INDIVIDUALLY today.
 *
 * `channel <> 'digest'` is the discriminator rather than the state, because a
 * row that escalated to push was still an individual alert and still counts
 * against the ceiling; only a row that arrived inside a digest does not.
 */
async function individualSentToday(
  admin: Admin,
  kind: PlatformNotificationKind,
  now: Date,
): Promise<number> {
  const since = platformDayStart(now).toISOString()
  const { count, error } = await admin
    .from('platform_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind)
    .in('delivery_state', ['sent', 'escalated'])
    .neq('channel', 'digest')
    .gte('sent_at', since)
  if (error) throw new Error(`platform_notifications count failed: ${error.message}`)
  return count ?? 0
}

/** Every push subscription belonging to an enabled admin. The second channel. */
export async function adminPushSubscriptions(admin: Admin): Promise<StoredSubscription[]> {
  const { data: admins, error: adminError } = await admin
    .from('admin_users')
    .select('id')
    .is('disabled_at', null)
  if (adminError) throw new Error(`admin_users read failed: ${adminError.message}`)
  const ids = (admins ?? []).map((a) => (a as { id: string }).id)
  if (ids.length === 0) return []

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', ids)
  if (error) throw new Error(`push_subscriptions read failed: ${error.message}`)
  return (data ?? []) as unknown as StoredSubscription[]
}

/**
 * The second channel, attempted once per notification.
 *
 * Returns the reason it could not be used rather than a bare false, because
 * "nobody has armed a device" and "every endpoint rejected us" are different
 * problems for the owner and the difference is written into last_error.
 */
async function escalate(
  admin: Admin,
  row: PlatformNotificationRow,
): Promise<{ delivered: boolean; reason: string }> {
  if (!isPushConfigured()) {
    return { delivered: false, reason: 'push is not configured on this deployment (VAPID keys absent)' }
  }
  const subs = await adminPushSubscriptions(admin)
  if (subs.length === 0) {
    return {
      delivered: false,
      reason: 'no admin device has enabled backup alerts at /admin/notifications',
    }
  }
  const payload = pushPayloadFor(row)
  let delivered = false
  const gone: string[] = []
  for (const sub of subs) {
    const result = await sendWebPush(sub, payload)
    if (result.ok) delivered = true
    else if (result.gone) gone.push(sub.endpoint)
  }
  if (gone.length > 0) {
    await admin.from('push_subscriptions').delete().in('endpoint', gone)
  }
  return {
    delivered,
    reason: delivered ? 'delivered by push' : `every one of ${subs.length} admin push endpoint(s) refused`,
  }
}

/** Write the outcome of one attempt back to the row. Never skipped. */
async function recordOutcome(
  admin: Admin,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from('platform_notifications').update(patch).eq('id', id)
  if (error) throw new Error(`platform_notifications update failed: ${error.message}`)
}

/**
 * Send everything pending, honouring the daily ceiling on capped kinds.
 *
 * Returns a count of what it did, which the cron route prints and the daily
 * state email reads, so "the dispatcher ran and had nothing to do" and "the
 * dispatcher never ran" are never the same observation.
 */
export async function dispatchPendingPlatformNotifications(options: {
  admin: Admin
  now?: Date
  limit?: number
}): Promise<DispatchSummary> {
  const { admin, now = new Date(), limit = 50 } = options
  const rows = await loadPending(admin, limit)
  const summary: DispatchSummary = {
    considered: rows.length,
    sent: 0,
    held: 0,
    escalated: 0,
    failed: 0,
    retried: 0,
  }
  if (rows.length === 0) return summary

  const siteUrl = getSiteUrl()
  const to = alertDestination()

  // One count per kind for the whole run, incremented locally as we send, so a
  // batch of thirty orders cannot slip thirty individual alerts past a ceiling
  // of twenty by each reading the same pre-run number.
  const sentTodayByKind = new Map<PlatformNotificationKind, number>()

  for (const row of rows) {
    if (!sentTodayByKind.has(row.kind)) {
      sentTodayByKind.set(row.kind, await individualSentToday(admin, row.kind, now))
    }
    const already = sentTodayByKind.get(row.kind) ?? 0

    if (routeFor(row.kind, already) === 'digest') {
      await recordOutcome(admin, row.id, { delivery_state: 'held_for_digest' })
      summary.held += 1
      continue
    }

    const attempt = row.attempts + 1
    try {
      const { html, text } = bodyFor(row, siteUrl)
      await sendEmail({ to, subject: subjectFor(row), html, text })
      await recordOutcome(admin, row.id, {
        delivery_state: 'sent',
        channel: 'email',
        sent_at: new Date().toISOString(),
        attempts: attempt,
        last_attempt_at: new Date().toISOString(),
        last_error: null,
      })
      sentTodayByKind.set(row.kind, already + 1)
      summary.sent += 1
      continue
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (attempt < PLATFORM_NOTIFY_MAX_EMAIL_ATTEMPTS) {
        await recordOutcome(admin, row.id, {
          attempts: attempt,
          last_attempt_at: new Date().toISOString(),
          last_error: `email attempt ${attempt}: ${message}`,
        })
        summary.retried += 1
        continue
      }

      const second = await escalate(admin, row)
      if (second.delivered) {
        await recordOutcome(admin, row.id, {
          delivery_state: 'escalated',
          channel: 'push',
          sent_at: new Date().toISOString(),
          attempts: attempt,
          last_attempt_at: new Date().toISOString(),
          last_error: `email failed ${attempt} time(s): ${message}`,
        })
        sentTodayByKind.set(row.kind, already + 1)
        summary.escalated += 1
        continue
      }

      await recordOutcome(admin, row.id, {
        delivery_state: 'failed',
        channel: null,
        attempts: attempt,
        last_attempt_at: new Date().toISOString(),
        last_error: `email failed ${attempt} time(s): ${message}; push: ${second.reason}`,
      })
      summary.failed += 1
      captureException(
        new Error(`platform notification ${row.id} undeliverable on every channel`),
        { scope: 'platform-notify', kind: row.kind, email_error: message, push_reason: second.reason },
      )
    }
  }

  return summary
}

export type DigestSummary = {
  held: number
  sent: number
  escalated: number
  failed: number
}

/**
 * Send the digest for everything held today, as ONE email. Close-out UX3.3.
 *
 * Called by the same cron as the dispatcher, after it, so a run that pushes a
 * kind past its ceiling also clears the overflow it just created.
 *
 * WHY IT SENDS ON EVERY TICK RATHER THAN ONLY AT MIDNIGHT. The owner asked to
 * know what is happening, not to be told tomorrow. A digest that batches the
 * overflow of the last few minutes still collapses fifty sales into one email,
 * which is the whole point of the ceiling, and it never delays a fact by a day.
 */
export async function sendHeldDigest(options: {
  admin: Admin
  now?: Date
  limit?: number
}): Promise<DigestSummary> {
  const { admin, limit = 200 } = options
  const { data, error } = await admin
    .from('platform_notifications')
    .select(SELECT_COLUMNS)
    .eq('delivery_state', 'held_for_digest')
    .order('occurred_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`platform_notifications digest read failed: ${error.message}`)
  const rows = (data ?? []) as unknown as PlatformNotificationRow[]
  const summary: DigestSummary = { held: rows.length, sent: 0, escalated: 0, failed: 0 }
  if (rows.length === 0) return summary

  const siteUrl = getSiteUrl()
  const { html, text } = digestBodyFor(rows, siteUrl)
  const stamp = new Date().toISOString()
  const ids = rows.map((r) => r.id)

  try {
    await sendEmail({
      to: alertDestination(),
      subject: digestSubjectFor(rows.length),
      html,
      text,
    })
    const { error: updateError } = await admin
      .from('platform_notifications')
      .update({
        delivery_state: 'sent',
        channel: 'digest',
        sent_at: stamp,
        last_attempt_at: stamp,
        last_error: null,
      })
      .in('id', ids)
    if (updateError) throw new Error(`digest update failed: ${updateError.message}`)
    summary.sent = rows.length
    return summary
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // A failed digest is escalated as ONE push naming the count, not as fifty.
    const second = await escalate(admin, {
      ...rows[0],
      summary: digestSubjectFor(rows.length).replace('EventLinqs: ', ''),
      admin_path: '/admin/notifications',
    })
    if (second.delivered) {
      await admin
        .from('platform_notifications')
        .update({
          delivery_state: 'escalated',
          channel: 'push',
          sent_at: stamp,
          last_attempt_at: stamp,
          last_error: `digest email failed: ${message}`,
        })
        .in('id', ids)
      summary.escalated = rows.length
      return summary
    }

    await admin
      .from('platform_notifications')
      .update({
        delivery_state: 'failed',
        channel: null,
        last_attempt_at: stamp,
        last_error: `digest email failed: ${message}; push: ${second.reason}`,
      })
      .in('id', ids)
    summary.failed = rows.length
    captureException(new Error(`platform notification digest of ${rows.length} undeliverable`), {
      scope: 'platform-notify',
      email_error: message,
      push_reason: second.reason,
    })
    return summary
  }
}

/** Everything the admin feed shows, newest first. */
export async function readPlatformNotificationFeed(
  admin: Admin,
  limit = 50,
): Promise<PlatformNotificationRow[]> {
  const { data, error } = await admin
    .from('platform_notifications')
    .select(SELECT_COLUMNS)
    .order('occurred_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`platform_notifications feed read failed: ${error.message}`)
  return (data ?? []) as unknown as PlatformNotificationRow[]
}

/** How many notifications are stuck, so the feed can say so at the top. */
export async function countUndelivered(admin: Admin): Promise<number> {
  const { count, error } = await admin
    .from('platform_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_state', 'failed')
  if (error) throw new Error(`platform_notifications failed-count read failed: ${error.message}`)
  return count ?? 0
}

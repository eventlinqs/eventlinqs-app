import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { chooseChannel, DEFAULT_PREFS, type NotificationPrefs } from '@/lib/notifications/policy'
import { isPushConfigured, sendWebPush, type StoredSubscription } from '@/lib/notifications/web-push'
import type { GigRow } from './gigs'
import { PERFORMANCE_TYPE_LABELS } from './gigs'
import { contactAddress } from '@/lib/email/sender'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readOrThrow } from '@/lib/supabase/read-or-throw'

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
  | {
      status: 'skipped'
      /**
       * `read_failed` is the reason this module did not have until 21
       * September 2026, and its absence is what made the other four lie. Every
       * other reason here is a FACT about a person: they already had this
       * alert, they turned these alerts off, they have no address. When a read
       * blinked, one of those facts was recorded about somebody it was not
       * true of. This one says what actually happened.
       */
      reason: 'duplicate' | 'opted_out' | 'no_email' | 'send_failed' | 'read_failed'
    }

/**
 * AN ANSWER, OR THE ADMISSION THAT THERE WASN'T ONE.
 *
 * Every helper below returns this rather than a bare value, because the whole
 * defect in this file was that `null` meant two different things: "the table
 * says no" and "the table did not answer". They lead to opposite decisions and
 * they were indistinguishable one line later.
 */
type Answered<T> = { failed: true } | { failed: false; value: T }

/**
 * THE PREFERENCES, WITH THE ONE DISTINCTION THAT MATTERS.
 *
 * NO ROW is a real and common answer: a person who has never opened the
 * preference centre has no row, and DEFAULT_PREFS is exactly right for them.
 * An ERROR is not that. Treating it as "no row" hands DEFAULT_PREFS to
 * somebody who may have switched these alerts OFF, and this module's own
 * header commits to the opposite ("the preference centre and the availability
 * toggle both stop future sends"). A blink is not consent.
 */
async function loadPrefs(admin: Admin, userId: string): Promise<Answered<NotificationPrefs>> {
  const { data, error } = await admin
    .from('notification_prefs')
    .select('push_enabled, email_enabled, quiet_hours_start, quiet_hours_end, timezone')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[marketplace-notify] could not read notification preferences; not sending:', error)
    return { failed: true }
  }
  return { failed: false, value: data ?? DEFAULT_PREFS }
}

/**
 * The address. A failed read here used to be reported as `no_email`, which is
 * a statement about a person's account that the code had no evidence for.
 */
async function resolveEmail(admin: Admin, userId: string): Promise<Answered<string | null>> {
  const { data, error } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle()
  if (error) {
    console.error('[marketplace-notify] could not read the recipient address:', error)
    return { failed: true }
  }
  return { failed: false, value: data?.email ?? null }
}

/**
 * EVERY DEVICE THIS PERSON REGISTERED, PAGED, AND A FAILURE THAT SAYS SO.
 *
 * Two faults in one line, both raised by lane B on 21 September and both here.
 * The read was UNBOUNDED, so past the PostgREST ceiling a device silently
 * stops being told; and it discarded its error, so a blink read as "this
 * person has no devices" and the alert fell to whatever channel was left.
 *
 * `readEveryRow` is the one pager and it THROWS on a real fault, which is
 * right for a caller that can fail and wrong for this one: a notification must
 * never fail the action that triggered it. So the throw is caught here, at the
 * one place that knows that, and turned into an admission the caller can act
 * on.
 */
async function loadSubscriptions(admin: Admin, userId: string): Promise<Answered<StoredSubscription[]>> {
  try {
    const rows = await readEveryRow<StoredSubscription>(
      'the push subscriptions for one recipient',
      (from, to) =>
        admin
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', userId)
          .order('endpoint', { ascending: true })
          .range(from, to),
    )
    return { failed: false, value: rows }
  } catch (error) {
    console.error('[marketplace-notify] could not read the push subscriptions:', error)
    return { failed: true }
  }
}

export async function dispatchMarketplaceAlert(
  input: MarketplaceDispatchInput,
): Promise<MarketplaceDispatchResult> {
  const { admin, userId, type, subjectId } = input

  /*
   * THE DEDUPE READ FAILS CLOSED, and that is a decision rather than a default.
   *
   * This module promises "one notification per (user, type, subject), ever",
   * and `notifications_subject_dedupe_uq` (migration 20260711000002) is the
   * database saying the same thing about the ROW. It cannot say it about the
   * SEND: the row is written after delivery, so this read is the only thing
   * standing between a person and a second copy of the same alert.
   *
   * Discarding its error made `existing` null, which reads as "never sent",
   * which sends again. The two outcomes are not symmetrical: a duplicate alert
   * is a message somebody did not agree to receive twice, on a platform whose
   * Spam Act posture is written at the top of this file, while a missed one is
   * an alert that did not go. So an unanswered read refuses.
   *
   * CLAIM-FIRST WAS CONSIDERED AND IS NOT AVAILABLE, recorded so nobody
   * re-derives it: inserting the row BEFORE sending would make the unique
   * index do this atomically and would close the read-then-send race as well,
   * but `notifications.channel` is `not null check (channel in ('push',
   * 'email'))` (migration 20260624000001), so a claim has no value to carry.
   * That is a migration, and a migration is the founder's to apply.
   */
  const { data: existing, error: existingError } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('subject_id', subjectId)
    .maybeSingle()
  if (existingError) {
    console.error('[marketplace-notify] could not check whether this alert was already sent; not sending:', existingError)
    return { status: 'skipped', reason: 'read_failed' }
  }
  if (existing) return { status: 'skipped', reason: 'duplicate' }

  const prefsRead = await loadPrefs(admin, userId)
  if (prefsRead.failed) return { status: 'skipped', reason: 'read_failed' }
  const prefs = prefsRead.value

  const subsRead = await loadSubscriptions(admin, userId)
  const subs = subsRead.failed ? [] : subsRead.value

  /*
   * A FAILED DEVICE READ DEGRADES TO EMAIL, AND ONLY EMAIL, AND SAYS SO.
   *
   * Unlike the dedupe read there is no second chance here: a gig is posted
   * once and this dispatcher runs once, so refusing outright is permanent
   * silence with nothing gained. Email is this platform's declared backbone
   * behind push, so a person whose device list could not be read still hears
   * about it on a channel they have switched on.
   *
   * What must NOT happen is the old ending: with no push and no email the
   * channel came back null and the result said `opted_out`, which is a
   * sentence about a person's choices written from a failed query.
   */
  const hasPush = isPushConfigured() && !subsRead.failed && subs.length > 0
  const channel = chooseChannel(prefs, hasPush)
  if (!channel) return { status: 'skipped', reason: subsRead.failed ? 'read_failed' : 'opted_out' }

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

  if (channel === 'push') {
    let anyOk = false
    const gone: string[] = []
    for (const sub of subs) {
      const res = await sendWebPush(sub, payload)
      if (res.ok) anyOk = true
      if (res.gone) gone.push(sub.endpoint)
    }
    if (gone.length > 0) {
      // A dead endpoint that cannot be removed is tried again on every future
      // alert, so a failure here is logged rather than dropped. It is not a
      // reason to fail the send: the alert already went.
      const { error: pruneError } = await admin.from('push_subscriptions').delete().in('endpoint', gone)
      if (pruneError) {
        console.error('[marketplace-notify] could not remove expired push endpoints:', pruneError)
      }
    }
    if (anyOk) delivered = 'push'
  }

  if (!delivered && prefs.email_enabled) {
    const emailRead = await resolveEmail(admin, userId)
    if (emailRead.failed) return { status: 'skipped', reason: 'read_failed' }
    const to = emailRead.value
    if (!to) return { status: 'skipped', reason: 'no_email' }
    try {
      const manageUrl = `${site}/account/notifications`
      await sendEmail({
        to,
        subject: input.title,
        messageType: 'marketplace_supplier_notice',
        recipientRole: 'organiser',
        html: marketplaceEmailHtml(payload, input.ctaLabel, manageUrl),
        text: `${payload.body}\n\n${payload.url}\n\nManage or turn off these alerts: ${manageUrl}\nEventLinqs, ${contactAddress('hello')}`,
      })
      delivered = 'email'
    } catch {
      delivered = null
    }
  }

  if (!delivered) return { status: 'skipped', reason: 'send_failed' }

  /*
   * THE RECORD OF THE SEND IS WHAT STOPS THE SECOND ONE, so a failure to write
   * it is logged loudly. The alert has already gone, so the result is still
   * `sent`: it went. What is now uncertain is whether the next dispatch will
   * know that, and a silent failure here is how a person gets told twice.
   */
  const { error: recordError } = await admin.from('notifications').insert({
    user_id: userId,
    event_id: null,
    subject_id: subjectId,
    type,
    channel: delivered,
    sent_at: new Date().toISOString(),
  })
  if (recordError) {
    console.error(
      `[marketplace-notify] delivered by ${delivered} but could not record it (user ${userId}, ${type}, subject ${subjectId}); a repeat is now possible:`,
      recordError,
    )
  }

  return { status: 'sent', channel: delivered }
}

/**
 * Alert performers whose showcase matches a freshly posted gig: available for
 * booking, based in the gig's city, doing the gig's performance type, with a
 * claimed account to notify. Capped and best-effort: a notify fault never
 * fails the posting.
 */
export async function notifyMatchingPerformers(admin: Admin, gig: GigRow): Promise<number> {
  /*
   * THROUGH THE DOOR, because here a failure genuinely should stop the work
   * rather than be absorbed into a number. This used to discard its error and
   * fall to `artists ?? []`, so a blink returned 0 and the caller recorded
   * that nobody in the city matched the gig. `readOrThrow` retries a transient
   * fault and throws a real one, and the only caller
   * (src/app/actions/gigs.ts, inside `after`) already catches so a notify
   * fault never fails the posting.
   */
  const artists = await readOrThrow('marketplace matching performers', () =>
    admin
      .from('artists')
      .select('id, owner_user_id')
      .eq('available_for_booking', true)
      .eq('city_slug', gig.city_slug)
      .contains('performance_types', [gig.performance_type])
      .not('owner_user_id', 'is', null)
      .limit(200),
  )

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
    <p style="margin:8px 4px 0;font-size:11px;color:#8b919c">EventLinqs, ${contactAddress('hello')}</p>
  </div></body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}
